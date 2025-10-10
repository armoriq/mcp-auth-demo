#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PROXY_DIR="$PROJECT_ROOT/armoriq-proxy"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is not installed or not in PATH." >&2
  exit 1
fi

DOCKER_USER="${DOCKER_USERNAME:-armoriq}"

IMAGE_NAME="${DOCKER_USER}/armoriq-mcp-proxy"
IMAGE_TAG="${IMAGE_TAG:-latest}"
FULL_TAG="${IMAGE_NAME}:${IMAGE_TAG}"

echo "Building Docker image ${FULL_TAG}..."
docker build --platform "${DOCKER_PLATFORM:-linux/amd64}" -t "${FULL_TAG}" "$PROXY_DIR"

echo "Pushing ${FULL_TAG} to Docker Hub..."
docker push "${FULL_TAG}"

echo "Done. Image available at docker.io/${FULL_TAG}"
