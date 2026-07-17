#!/usr/bin/env bash
set -euo pipefail

# Sync the canonical SemossWeb portal source into this app asset repository,
# then build the local portal bundle used for SEMOSS app testing.

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_ROOT="$(cd "${APP_ROOT}/../../../../../../" && pwd)"
DEFAULT_SOURCE="${WORKSPACE_ROOT}/apache-tomcat-9.0.113/webapps/SemossWeb/packages/playwright-browser-sockets"
SOURCE_ROOT="${SEMOSS_WEB_APP_DIR:-${DEFAULT_SOURCE}}"

if [[ ! -d "${SOURCE_ROOT}/src" || ! -f "${SOURCE_ROOT}/package.json" ]]; then
  echo "SEMOSS Web source app was not found: ${SOURCE_ROOT}" >&2
  echo "Set SEMOSS_WEB_APP_DIR to the playwright-browser-sockets package directory." >&2
  exit 1
fi

command -v rsync >/dev/null || {
  echo "rsync is required to synchronize the portal source." >&2
  exit 1
}

command -v pnpm >/dev/null || {
  echo "pnpm is required to install dependencies and build portals." >&2
  exit 1
}

echo "Syncing canonical source from ${SOURCE_ROOT}"
rsync -a --delete --exclude node_modules --exclude portals "${SOURCE_ROOT}/src/" "${APP_ROOT}/src/"
rsync -a --delete "${SOURCE_ROOT}/mcp/" "${APP_ROOT}/mcp/"

for file in index.html package.json package-lock.json tsconfig.json vite.config.ts; do
  if [[ -f "${SOURCE_ROOT}/${file}" ]]; then
    cp "${SOURCE_ROOT}/${file}" "${APP_ROOT}/${file}"
  fi
done

echo "Installing portal dependencies"
(
  cd "${APP_ROOT}"
  pnpm install
)

echo "Building portal bundle"
(
  cd "${APP_ROOT}"
  pnpm exec vite build --outDir portals
)

echo "Portal source synchronized and built at ${APP_ROOT}/portals"
