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
  echo "Error: curl is required for the vulnerability demonstration." >&2
  exit 1
fi

MCP_URL="http://localhost:3001/api/customers"

echo "Starting bare MCP endpoint without the ArmorIQ proxy..."
docker compose -f "$COMPOSE_FILE" up -d mcp-endpoint

echo "Waiting for the MCP endpoint to start..."
sleep 3

echo
echo "Demonstrating exposure without ArmorIQ:"
echo "1) Any client can read customer data with no authentication:"
curl -sS -w '\nHTTP %{http_code}\n' "${MCP_URL}" || true

echo
echo "2) Any client can DELETE customer data without authorization:"
curl -sS -w '\nHTTP %{http_code}\n' -X DELETE "${MCP_URL}/1" || true

echo
echo "This shows the risk of exposing the MCP endpoint directly."
echo "Stop the service with:"
echo "  docker compose -f ${COMPOSE_FILE} down"
