#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command '$1' not found in PATH." >&2
    exit 1
  fi
}

echo "📦 Installing MCP Auth demo prerequisites..."

require_command python3
require_command npm

echo "➡️  Installing Python dependencies for admin API..."
(cd "$PROJECT_ROOT/admin-api" && python3 -m pip install --upgrade pip --user >/dev/null && python3 -m pip install --user -r requirements.txt)

echo "➡️  Installing npm dependencies for MCP endpoint..."
(cd "$PROJECT_ROOT/mcp-endpoint-example" && npm install)

echo "➡️  Installing npm dependencies for ArmorIQ proxy..."
(cd "$PROJECT_ROOT/armoriq-proxy" && npm install)

echo "➡️  Installing npm dependencies for agent example..."
(cd "$PROJECT_ROOT/agent-example" && npm install)

echo "✅ Installation complete."
