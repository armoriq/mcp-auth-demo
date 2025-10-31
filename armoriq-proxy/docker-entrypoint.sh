#!/bin/sh
set -eu

CLIENT_CA_FILE=""
MCP_ENDPOINT_URL_VALUE=""
MCP_DEFINITION_FILE=""
TMP_DIR="/tmp/armoriq"
ENTRYPOINT_LOG_PREFIX="[entrypoint]"
TOKEN_PUBLIC_KEY_FILE=""
TOKEN_JWKS_FILE=""
TOKEN_ISSUER_VALUE=""
TOKEN_AUDIENCE_VALUE=""
TOKEN_ALG_VALUE=""

mkdir -p "${TMP_DIR}"

log() {
  echo "${ENTRYPOINT_LOG_PREFIX} $*"
}

usage() {
  cat <<'USAGE'
Usage: docker run armoriq-proxy [options] [-- npm start args...]

Options:
  --client-ca PATH            Path to a PEM certificate used to verify client certificates.
  --client-ca-inline STRING   Inline PEM string for the client CA certificate.
  --client-ca-b64 STRING      Base64-encoded client CA certificate (PEM after decoding).
  --server-cert PATH          Path to the server TLS certificate (PEM).
  --server-cert-inline STRING Inline PEM string for the server TLS certificate.
  --server-cert-b64 STRING    Base64-encoded server TLS certificate (PEM after decoding).
  --server-key PATH           Path to the server TLS private key (PEM).
  --server-key-inline STRING  Inline PEM string for the server TLS private key.
  --server-key-b64 STRING     Base64-encoded server TLS private key (PEM after decoding).
  --mcp-endpoint URL          MCP endpoint base URL to proxy.
  --mcp-definition PATH       Path to MCP metadata (JSON or YAML with resources/prompts/tools).
  --mcp-definition-inline STRING  Inline JSON/YAML string describing MCP metadata.
  --mcp-definition-b64 STRING Base64-encoded JSON/YAML describing MCP metadata.
  --token-public-key PATH     Path to PEM-encoded public key used to verify access tokens.
  --token-public-key-inline STRING  Inline PEM public key for access token verification.
  --token-public-key-b64 STRING     Base64-encoded PEM public key for access token verification.
  --token-jwks PATH           Path to a JWKS (JSON) document for access token verification.
  --token-jwks-inline STRING  Inline JWKS JSON for access token verification.
  --token-jwks-b64 STRING     Base64-encoded JWKS JSON for access token verification.
  --token-issuer STRING       Expected issuer claim for access tokens.
  --token-audience STRING     Expected audience claim for access tokens.
  --token-alg STRING          Expected JWS algorithm (used with PEM public keys, default RS256).
  --help                      Show this help message.

Environment overrides:
  MCP_ENDPOINT_URL, MCP_DEFINITION_PATH, MCP_DEFINITION_JSON,
  CLIENT_CA_CERT_PATH, PROXY_TLS_CERT_PATH, PROXY_TLS_KEY_PATH,
  ARMORIQ_TOKEN_PUBLIC_KEY_PATH, ARMORIQ_TOKEN_JWKS_PATH,
  ARMORIQ_TOKEN_ISSUER, ARMORIQ_TOKEN_AUDIENCE, ARMORIQ_TOKEN_ALG.

Any arguments after "--" are passed to the underlying npm start command.
USAGE
}

write_inline() {
  data="$1"
  dest="$2"
  printf '%s\n' "$data" > "$dest"
}

write_b64() {
  data="$1"
  dest="$2"
  echo "$data" | base64 -d > "$dest"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --client-ca)
      CLIENT_CA_FILE="$2"
      shift 2
      ;;
    --client-ca-inline)
      CLIENT_CA_FILE="${TMP_DIR}/client-ca.pem"
      write_inline "$2" "$CLIENT_CA_FILE"
      shift 2
      ;;
    --client-ca-b64)
      CLIENT_CA_FILE="${TMP_DIR}/client-ca.pem"
      write_b64 "$2" "$CLIENT_CA_FILE"
      shift 2
      ;;
    --server-cert)
      export PROXY_TLS_CERT_PATH="$2"
      shift 2
      ;;
    --server-cert-inline)
      export PROXY_TLS_CERT_PATH="${TMP_DIR}/server-cert.pem"
      write_inline "$2" "$PROXY_TLS_CERT_PATH"
      shift 2
      ;;
    --server-cert-b64)
      export PROXY_TLS_CERT_PATH="${TMP_DIR}/server-cert.pem"
      write_b64 "$2" "$PROXY_TLS_CERT_PATH"
      shift 2
      ;;
    --server-key)
      export PROXY_TLS_KEY_PATH="$2"
      shift 2
      ;;
    --server-key-inline)
      export PROXY_TLS_KEY_PATH="${TMP_DIR}/server-key.pem"
      write_inline "$2" "$PROXY_TLS_KEY_PATH"
      shift 2
      ;;
    --server-key-b64)
      export PROXY_TLS_KEY_PATH="${TMP_DIR}/server-key.pem"
      write_b64 "$2" "$PROXY_TLS_KEY_PATH"
      shift 2
      ;;
    --mcp-endpoint)
      MCP_ENDPOINT_URL_VALUE="$2"
      shift 2
      ;;
    --mcp-definition)
      MCP_DEFINITION_FILE="$2"
      shift 2
      ;;
    --mcp-definition-inline)
      MCP_DEFINITION_FILE="${TMP_DIR}/mcp-definition.json"
      write_inline "$2" "$MCP_DEFINITION_FILE"
      shift 2
      ;;
    --mcp-definition-b64)
      MCP_DEFINITION_FILE="${TMP_DIR}/mcp-definition.json"
      write_b64 "$2" "$MCP_DEFINITION_FILE"
      shift 2
      ;;
    --token-public-key)
      TOKEN_PUBLIC_KEY_FILE="$2"
      TOKEN_JWKS_FILE=""
      shift 2
      ;;
    --token-public-key-inline)
      TOKEN_PUBLIC_KEY_FILE="${TMP_DIR}/token-pubkey.pem"
      TOKEN_JWKS_FILE=""
      write_inline "$2" "$TOKEN_PUBLIC_KEY_FILE"
      shift 2
      ;;
    --token-public-key-b64)
      TOKEN_PUBLIC_KEY_FILE="${TMP_DIR}/token-pubkey.pem"
      TOKEN_JWKS_FILE=""
      write_b64 "$2" "$TOKEN_PUBLIC_KEY_FILE"
      shift 2
      ;;
    --token-jwks)
      TOKEN_JWKS_FILE="$2"
      TOKEN_PUBLIC_KEY_FILE=""
      shift 2
      ;;
    --token-jwks-inline)
      TOKEN_JWKS_FILE="${TMP_DIR}/token-jwks.json"
      TOKEN_PUBLIC_KEY_FILE=""
      write_inline "$2" "$TOKEN_JWKS_FILE"
      shift 2
      ;;
    --token-jwks-b64)
      TOKEN_JWKS_FILE="${TMP_DIR}/token-jwks.json"
      TOKEN_PUBLIC_KEY_FILE=""
      write_b64 "$2" "$TOKEN_JWKS_FILE"
      shift 2
      ;;
    --token-issuer)
      TOKEN_ISSUER_VALUE="$2"
      shift 2
      ;;
    --token-audience)
      TOKEN_AUDIENCE_VALUE="$2"
      shift 2
      ;;
    --token-alg)
      TOKEN_ALG_VALUE="$2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    *)
      break
      ;;
  esac
done

if [ -n "${CLIENT_CA_FILE}" ]; then
  export CLIENT_CA_CERT_PATH="${CLIENT_CA_FILE}"
  log "Using client CA certificate: ${CLIENT_CA_CERT_PATH}"
fi

if [ -n "${TOKEN_PUBLIC_KEY_FILE}" ]; then
  export ARMORIQ_TOKEN_PUBLIC_KEY_PATH="${TOKEN_PUBLIC_KEY_FILE}"
  log "Using access-token public key: ${ARMORIQ_TOKEN_PUBLIC_KEY_PATH}"
fi

if [ -n "${TOKEN_JWKS_FILE}" ]; then
  export ARMORIQ_TOKEN_JWKS_PATH="${TOKEN_JWKS_FILE}"
  log "Using access-token JWKS: ${ARMORIQ_TOKEN_JWKS_PATH}"
fi

if [ -n "${TOKEN_ISSUER_VALUE}" ]; then
  export ARMORIQ_TOKEN_ISSUER="${TOKEN_ISSUER_VALUE}"
  log "Expecting token issuer: ${ARMORIQ_TOKEN_ISSUER}"
fi

if [ -n "${TOKEN_AUDIENCE_VALUE}" ]; then
  export ARMORIQ_TOKEN_AUDIENCE="${TOKEN_AUDIENCE_VALUE}"
  log "Expecting token audience: ${ARMORIQ_TOKEN_AUDIENCE}"
fi

if [ -n "${TOKEN_ALG_VALUE}" ]; then
  export ARMORIQ_TOKEN_ALG="${TOKEN_ALG_VALUE}"
  log "Token algorithm override: ${ARMORIQ_TOKEN_ALG}"
fi

if [ -n "${MCP_ENDPOINT_URL_VALUE}" ]; then
  export MCP_ENDPOINT_URL="${MCP_ENDPOINT_URL_VALUE}"
  log "Using MCP endpoint: ${MCP_ENDPOINT_URL}"
fi

if [ -n "${MCP_DEFINITION_FILE}" ]; then
  export MCP_DEFINITION_PATH="${MCP_DEFINITION_FILE}"
  log "Loading MCP metadata from: ${MCP_DEFINITION_PATH}"
fi

if [ -z "${PROXY_TLS_CERT_PATH:-}" ] || [ -z "${PROXY_TLS_KEY_PATH:-}" ]; then
  log "TLS certificate or key not provided; proxy will fall back to HTTP."
else
  log "TLS enabled with provided certificate and key."
fi

if [ $# -eq 0 ]; then
  set -- npm start
fi

exec "$@"
