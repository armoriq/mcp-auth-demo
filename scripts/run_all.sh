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

API_KEY="${ARMORIQ_API_KEY:-demo-key-12345678901234567890}"
AGENT_ID="${AGENT_ID:-agent-123}"
ENDPOINT_ID="${ENDPOINT_ID:-customer-data-service}"
PROXY_URL="http://localhost:5001"
PROXY_PATH="/proxy/${ENDPOINT_ID}/api/customers"

echo "Starting ArmorIQ proxy stack (proxy + MCP endpoint)..."
docker compose -f "$COMPOSE_FILE" up -d armoriq-proxy

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
echo "To explore further, use the proxy at ${PROXY_URL}."
echo
echo "When finished, shut everything down with:"
echo "  docker compose -f ${COMPOSE_FILE} down"
