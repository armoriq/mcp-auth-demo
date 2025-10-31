#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PROXY_DIR="$PROJECT_ROOT/armoriq-proxy"
DEMO_DIR="$PROXY_DIR/demo-config"

mkdir -p "$DEMO_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command '$1' not found in PATH." >&2
    exit 1
  fi
}

require_command docker
require_command openssl
require_command curl
require_command node
require_command npm

PYTHON_BIN="${PYTHON_BIN:-python3}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  if command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
  else
    echo "Error: python3 (or python) is required." >&2
    exit 1
  fi
fi

KEY_ID="${ARMORIQ_TOKEN_KEY_ID:-armoriq-demo-key}"
TOKEN_ISSUER="${ARMORIQ_TOKEN_ISSUER:-https://auth.armoriq-demo.local}"
TOKEN_AUDIENCE="${ARMORIQ_TOKEN_AUDIENCE:-armoriq-proxy}"
TOKEN_SUBJECT="${ARMORIQ_TOKEN_SUBJECT:-agent-123}"
TOKEN_ENDPOINT="${ENDPOINT_ID:-customer-data-service}"
TOKEN_TTL="${ARMORIQ_TOKEN_TTL:-3600}"
API_KEY="${ARMORIQ_API_KEY:-demo-key-12345678901234567890}"
DOCKER_HOST_ALIAS="${ARMORIQ_DOCKER_HOST_ALIAS:-host.docker.internal}"

TLS_CERT_PATH="$DEMO_DIR/proxy.crt"
TLS_KEY_PATH="$DEMO_DIR/proxy.key"
SIGNING_PRIVATE_KEY="$DEMO_DIR/token-signing-private.pem"
SIGNING_PUBLIC_KEY="$DEMO_DIR/token-signing-public.pem"
JWKS_PATH="$DEMO_DIR/token-signers.jwks"
TOKEN_OUTPUT_PATH="$DEMO_DIR/access-token.jwt"
TOKEN_CLAIMS_PATH="$DEMO_DIR/token-claims.json"
MCP_DEFINITION_PATH="$DEMO_DIR/mcp-definition.yaml"
ENDPOINT_DIR="$PROJECT_ROOT/mcp-endpoint-example"
ENDPOINT_LOG="$DEMO_DIR/mcp-endpoint.log"
ENDPOINT_PID=""

if [ ! -d "$ENDPOINT_DIR" ]; then
  echo "Error: expected MCP endpoint directory at $ENDPOINT_DIR" >&2
  exit 1
fi

echo "🔧 Generating TLS certificate for the proxy (self-signed)..."
openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout "$TLS_KEY_PATH" \
  -out "$TLS_CERT_PATH" \
  -days 365 \
  -subj "/CN=armoriq-proxy" >/dev/null 2>&1

echo "🔑 Generating RSA key pair for JWT signing..."
openssl genrsa -out "$SIGNING_PRIVATE_KEY" 2048 >/dev/null 2>&1
openssl rsa -in "$SIGNING_PRIVATE_KEY" -pubout -out "$SIGNING_PUBLIC_KEY" >/dev/null 2>&1

MOD_HEX="$(openssl rsa -in "$SIGNING_PUBLIC_KEY" -pubin -modulus -noout | cut -d= -f2)"
EXP_DEC="$(openssl rsa -in "$SIGNING_PUBLIC_KEY" -pubin -text -noout | awk '/Exponent:/{print $2}')"

export TOKEN_MODULUS_HEX="$MOD_HEX"
export TOKEN_EXPONENT_DEC="$EXP_DEC"

MOD_B64="$("$PYTHON_BIN" - <<'PY'
import base64, binascii, os
hex_value = os.environ['TOKEN_MODULUS_HEX']
data = binascii.unhexlify(hex_value)
print(base64.urlsafe_b64encode(data).decode().rstrip('='))
PY
)"

EXP_B64="$("$PYTHON_BIN" - <<'PY'
import base64, os
value = int(os.environ['TOKEN_EXPONENT_DEC'])
length = (value.bit_length() + 7) // 8
print(base64.urlsafe_b64encode(value.to_bytes(length, 'big')).decode().rstrip('='))
PY
)"

cat > "$JWKS_PATH" <<JSON
{
  "keys": [
    {
      "kty": "RSA",
      "kid": "$KEY_ID",
      "use": "sig",
      "alg": "RS256",
      "n": "$MOD_B64",
      "e": "$EXP_B64"
    }
  ]
}
JSON

export TOKEN_KEY_ID="$KEY_ID"
HEADER_B64="$("$PYTHON_BIN" - <<'PY'
import base64, json, os
header = {"alg": "RS256", "typ": "JWT", "kid": os.environ["TOKEN_KEY_ID"]}
print(base64.urlsafe_b64encode(json.dumps(header, separators=(',', ':')).encode()).decode().rstrip('='))
PY
)"

export TOKEN_ISSUER TOKEN_AUDIENCE TOKEN_SUBJECT TOKEN_ENDPOINT TOKEN_TTL TOKEN_CLAIMS_PATH
PAYLOAD_B64="$("$PYTHON_BIN" - <<'PY'
import base64, json, os, time

now = int(time.time())
payload = {
    "iss": os.environ["TOKEN_ISSUER"],
    "aud": os.environ["TOKEN_AUDIENCE"],
    "sub": os.environ["TOKEN_SUBJECT"],
    "iat": now,
    "exp": now + int(os.environ["TOKEN_TTL"]),
    "policies": [
        {
            "endpoint": os.environ["TOKEN_ENDPOINT"],
            "permissions": {
                "read": ["/api/customers", "/api/customers/*"],
                "create": True,
                "update": ["/api/customers/*"],
                "delete": False
            }
        }
    ]
}

with open(os.environ["TOKEN_CLAIMS_PATH"], "w", encoding="utf-8") as fh:
    json.dump(payload, fh, indent=2)

encoded = base64.urlsafe_b64encode(json.dumps(payload, separators=(',', ':')).encode()).decode().rstrip('=')
print(encoded)
PY
)"

SIGNING_INPUT="${HEADER_B64}.${PAYLOAD_B64}"
SIGNING_INPUT_PATH="$DEMO_DIR/signing-input.txt"
SIGNATURE_BIN_PATH="$DEMO_DIR/signature.bin"

printf '%s' "$SIGNING_INPUT" > "$SIGNING_INPUT_PATH"
openssl dgst -sha256 -sign "$SIGNING_PRIVATE_KEY" -out "$SIGNATURE_BIN_PATH" "$SIGNING_INPUT_PATH" >/dev/null 2>&1

export TOKEN_SIGNATURE_PATH="$SIGNATURE_BIN_PATH"
SIGNATURE_B64="$("$PYTHON_BIN" - <<'PY'
import base64, os
with open(os.environ["TOKEN_SIGNATURE_PATH"], "rb") as fh:
    print(base64.urlsafe_b64encode(fh.read()).decode().rstrip('='))
PY
)"

ACCESS_TOKEN="${SIGNING_INPUT}.${SIGNATURE_B64}"
printf '%s\n' "$ACCESS_TOKEN" > "$TOKEN_OUTPUT_PATH"
rm -f "$SIGNING_INPUT_PATH" "$SIGNATURE_BIN_PATH"

find_available_port() {
  local start_port="$1"
  "$PYTHON_BIN" - <<'PY' "$start_port"
import socket
import sys

base = int(sys.argv[1])
port = base
for _ in range(50):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("0.0.0.0", port))
        except OSError:
            port += 1
        else:
            print(port)
            break
else:
    sys.exit("No available port found in range.")
PY
}

DEFAULT_ENDPOINT_PORT="${MCP_ENDPOINT_HOST_PORT:-3001}"
AVAILABLE_ENDPOINT_PORT="$(find_available_port "${DEFAULT_ENDPOINT_PORT}")"
if [ "${AVAILABLE_ENDPOINT_PORT}" != "${DEFAULT_ENDPOINT_PORT}" ]; then
  echo "➡️  MCP endpoint port ${DEFAULT_ENDPOINT_PORT} busy; using ${AVAILABLE_ENDPOINT_PORT}"
fi

DEFAULT_PROXY_PORT="${ARMORIQ_PROXY_HOST_PORT:-5001}"
AVAILABLE_PROXY_PORT="$(find_available_port "${DEFAULT_PROXY_PORT}")"
export ARMORIQ_PROXY_HOST_PORT="${AVAILABLE_PROXY_PORT}"
if [ "${AVAILABLE_PROXY_PORT}" != "${DEFAULT_PROXY_PORT}" ]; then
  echo "➡️  Proxy port ${DEFAULT_PROXY_PORT} busy; using ${AVAILABLE_PROXY_PORT}"
fi

DEFAULT_ADMIN_PORT="${ADMIN_API_HOST_PORT:-8000}"
AVAILABLE_ADMIN_PORT="$(find_available_port "${DEFAULT_ADMIN_PORT}")"
export ADMIN_API_HOST_PORT="${AVAILABLE_ADMIN_PORT}"
if [ "${AVAILABLE_ADMIN_PORT}" != "${DEFAULT_ADMIN_PORT}" ]; then
  echo "➡️  Admin API port ${DEFAULT_ADMIN_PORT} busy; using ${AVAILABLE_ADMIN_PORT}"
fi

if [ ! -d "$ENDPOINT_DIR/node_modules" ]; then
  echo "📦 Installing dependencies for local MCP endpoint..."
  (cd "$ENDPOINT_DIR" && npm install >/dev/null)
fi

echo "🔗 Proxy container will reach local endpoint via host alias: ${DOCKER_HOST_ALIAS}"

echo "🚿 Starting local MCP endpoint on port ${AVAILABLE_ENDPOINT_PORT}..."
PORT="${AVAILABLE_ENDPOINT_PORT}" npm start --prefix "$ENDPOINT_DIR" >"$ENDPOINT_LOG" 2>&1 &
ENDPOINT_PID=$!
sleep 3
if ! kill -0 "$ENDPOINT_PID" >/dev/null 2>&1; then
  echo "Error: MCP endpoint failed to start. See $ENDPOINT_LOG" >&2
  exit 1
fi

cat > "$MCP_DEFINITION_PATH" <<YAML
endpoint:
  id: customer-data-service
  name: Customer Data Service
  url: http://${DOCKER_HOST_ALIAS}:${AVAILABLE_ENDPOINT_PORT}
  description: Demo customer data service exposed via MCP
  apiKey: demo-key-12345678901234567890
resources:
  - id: customers
    path: /api/customers
    description: Retrieve the full list of customers
prompts:
  - id: customer-status
    description: Summarize the customer's current plan and status
    template: |
      Provide the subscription plan and account status for customer {{name}}.
tools:
  - id: create-customer
    description: Create a new customer record
    method: POST
    path: /api/customers
    schema: |
      {
        "type": "object",
        "required": ["name", "email", "plan"],
        "properties": {
          "name": {"type": "string"},
          "email": {"type": "string"},
          "plan": {"type": "string"}
        }
      }
YAML

OVERRIDE_FILE="$(mktemp "${PROJECT_ROOT}/armoriq-demo-compose.XXXX.yaml")"
cleanup() {
  if [ -n "$ENDPOINT_PID" ]; then
    kill "$ENDPOINT_PID" >/dev/null 2>&1 || true
    wait "$ENDPOINT_PID" 2>/dev/null || true
    ENDPOINT_PID=""
  fi
  rm -f "$OVERRIDE_FILE"
}
trap cleanup EXIT

cat > "$OVERRIDE_FILE" <<YAML
version: "3.9"
services:
  armoriq-proxy:
    extra_hosts:
      - "${DOCKER_HOST_ALIAS}:host-gateway"
    environment:
      MCP_ENDPOINT_URL: http://${DOCKER_HOST_ALIAS}:${AVAILABLE_ENDPOINT_PORT}
      MCP_DEFINITION_PATH: /app/demo-config/mcp-definition.yaml
      ARMORIQ_TOKEN_JWKS_PATH: /app/demo-config/token-signers.jwks
      ARMORIQ_TOKEN_ISSUER: ${TOKEN_ISSUER}
      ARMORIQ_TOKEN_AUDIENCE: ${TOKEN_AUDIENCE}
      PROXY_TLS_CERT_PATH: /app/demo-config/proxy.crt
      PROXY_TLS_KEY_PATH: /app/demo-config/proxy.key
YAML

echo "🧱 Rebuilding armoriq-proxy image with demo assets..."
(
  cd "$PROJECT_ROOT"
  docker compose build armoriq-proxy >/dev/null
)

echo "🚀 Starting ArmorIQ proxy container (TLS enabled, JWT auth)..."
(
  cd "$PROJECT_ROOT"
  docker compose -f docker-compose.yml -f "$OVERRIDE_FILE" up -d --no-deps armoriq-proxy >/dev/null
)

echo "⏳ Waiting for services..."
sleep 5

PROXY_SCHEME="https"
PROXY_URL="${PROXY_SCHEME}://localhost:${ARMORIQ_PROXY_HOST_PORT}"
PROXY_PATH="/proxy/${TOKEN_ENDPOINT}/api/customers"

export ARMORIQ_ACCESS_TOKEN="$ACCESS_TOKEN"

echo
echo "=== ArmorIQ Token Demo ==="
echo "Demo assets generated under: $DEMO_DIR"
echo "Access token saved at: $TOKEN_OUTPUT_PATH"
echo "JWKS published at: $JWKS_PATH"
echo

echo "1) Anonymous request (no token) should be rejected:"
curl -ksS -w '\nHTTP %{http_code}\n' "${PROXY_URL}${PROXY_PATH}" || true

echo
echo "2) Authenticated GET with JWT permissions (should succeed):"
curl -ksS -w '\nHTTP %{http_code}\n' \
  -H "X-ArmorIQ-API-Key: ${API_KEY}" \
  -H "Authorization: Bearer ${ARMORIQ_ACCESS_TOKEN}" \
  "${PROXY_URL}${PROXY_PATH}" || true

echo
echo "3) Authenticated DELETE blocked by token policy:"
curl -ksS -w '\nHTTP %{http_code}\n' -X DELETE \
  -H "X-ArmorIQ-API-Key: ${API_KEY}" \
  -H "Authorization: Bearer ${ARMORIQ_ACCESS_TOKEN}" \
  "${PROXY_URL}${PROXY_PATH}/1" || true

echo
echo "✅ Demo complete. Containers left running:"
echo "   docker compose ps armoriq-proxy"
echo "🔻 Tear down when finished:"
echo "   docker compose down"
echo "📝 MCP endpoint log: $ENDPOINT_LOG"
echo
echo "To reuse the generated token, export it in your shell:"
echo "   export ARMORIQ_ACCESS_TOKEN=\"$(cat "$TOKEN_OUTPUT_PATH")\""
echo
