#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.yml"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is not installed or not in PATH." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Error: docker compose CLI is not available. Install Docker Compose v2." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "Error: curl is required for the security demonstration." >&2
  exit 1
fi

PYTHON_BIN="${PYTHON_BIN:-python3}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  PYTHON_BIN="python"
  if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
    echo "Error: python3 or python is required to probe for free ports." >&2
    exit 1
  fi
fi

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
export MCP_ENDPOINT_HOST_PORT="${AVAILABLE_ENDPOINT_PORT}"
if [ "${AVAILABLE_ENDPOINT_PORT}" != "${DEFAULT_ENDPOINT_PORT}" ]; then
  echo "Port ${DEFAULT_ENDPOINT_PORT} is busy. Using endpoint port ${AVAILABLE_ENDPOINT_PORT} instead."
fi

DEFAULT_PROXY_PORT="${ARMORIQ_PROXY_HOST_PORT:-5001}"
AVAILABLE_PROXY_PORT="$(find_available_port "${DEFAULT_PROXY_PORT}")"
export ARMORIQ_PROXY_HOST_PORT="${AVAILABLE_PROXY_PORT}"
if [ "${AVAILABLE_PROXY_PORT}" != "${DEFAULT_PROXY_PORT}" ]; then
  echo "Port ${DEFAULT_PROXY_PORT} is busy. Using proxy port ${AVAILABLE_PROXY_PORT} instead."
fi

DEFAULT_ADMIN_PORT="${ADMIN_API_HOST_PORT:-8000}"
AVAILABLE_ADMIN_PORT="$(find_available_port "${DEFAULT_ADMIN_PORT}")"
export ADMIN_API_HOST_PORT="${AVAILABLE_ADMIN_PORT}"
if [ "${AVAILABLE_ADMIN_PORT}" != "${DEFAULT_ADMIN_PORT}" ]; then
  echo "Port ${DEFAULT_ADMIN_PORT} is busy. Using admin API port ${AVAILABLE_ADMIN_PORT} instead."
fi

API_KEY="${ARMORIQ_API_KEY:-demo-key-12345678901234567890}"
AGENT_ID="${AGENT_ID:-agent-123}"
ENDPOINT_ID="${ENDPOINT_ID:-customer-data-service}"
PROXY_URL="http://localhost:${AVAILABLE_PROXY_PORT}"
PROXY_PATH="/proxy/${ENDPOINT_ID}/api/customers"
ADMIN_URL="http://localhost:${AVAILABLE_ADMIN_PORT}"

echo "Starting ArmorIQ proxy stack (proxy + MCP endpoint + admin API)..."
docker compose -f "$COMPOSE_FILE" up -d armoriq-proxy admin-api

echo "Waiting for services to become ready..."
sleep 3

echo
echo "Demonstrating ArmorIQ protections:"
echo "1) Blocking anonymous access to the MCP endpoint:"
curl -sS -w '\nHTTP %{http_code}\n' "${PROXY_URL}${PROXY_PATH}" || true

echo
echo "2) Permitting authorized READ access through the proxy:"
curl -sS -w '\nHTTP %{http_code}\n' \
  -H "X-ArmorIQ-API-Key: ${API_KEY}" \
  -H "X-ArmorIQ-Agent-ID: ${AGENT_ID}" \
  "${PROXY_URL}${PROXY_PATH}" || true

echo
echo "3) Blocking unauthorized DELETE (policy denies delete):"
curl -sS -w '\nHTTP %{http_code}\n' -X DELETE \
  -H "X-ArmorIQ-API-Key: ${API_KEY}" \
  -H "X-ArmorIQ-Agent-ID: ${AGENT_ID}" \
  "${PROXY_URL}${PROXY_PATH}/1" || true

echo
echo "ArmorIQ proxy is now running and enforcing access controls."
echo "Admin API for UI integrations is available at ${ADMIN_URL}."
echo "To explore further, use the proxy at ${PROXY_URL}."
echo
echo "When finished, shut everything down with:"
echo "  docker compose -f ${COMPOSE_FILE} down"
