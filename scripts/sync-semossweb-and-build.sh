#!/usr/bin/env bash
set -euo pipefail

# Sync the canonical SemossWeb portal source into this app asset repository,
# then build the local portal bundle used for SEMOSS app testing.

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_ROOT="$(cd "${APP_ROOT}/../../../../../../" && pwd)"
DEFAULT_SOURCE="${WORKSPACE_ROOT}/apache-tomcat-9.0.113/webapps/SemossWeb/packages/playwright-browser-sockets"
SOURCE_ROOT="${SEMOSS_WEB_APP_DIR:-${DEFAULT_SOURCE}}"
SEMOSS_WEB_ROOT="$(cd "${SOURCE_ROOT}/../.." && pwd)"
UI_ROOT="${SEMOSS_UI_LIB_DIR:-${SEMOSS_WEB_ROOT}/libs/ui}"

if [[ ! -d "${SOURCE_ROOT}/src" || ! -f "${SOURCE_ROOT}/package.json" ]]; then
  echo "SEMOSS Web source app was not found: ${SOURCE_ROOT}" >&2
  echo "Set SEMOSS_WEB_APP_DIR to the playwright-browser-sockets package directory." >&2
  exit 1
fi

if [[ ! -f "${UI_ROOT}/package.json" ]]; then
  echo "SEMOSS UI library was not found: ${UI_ROOT}" >&2
  echo "Set SEMOSS_UI_LIB_DIR to the SemossWeb libs/ui directory." >&2
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

echo "Building and vendoring the shared SEMOSS UI library"
(
  cd "${SEMOSS_WEB_ROOT}"
  pnpm --filter @semoss/ui build
)
rm -rf "${APP_ROOT}/vendor/semoss-ui"
mkdir -p "${APP_ROOT}/vendor/semoss-ui"
cp "${UI_ROOT}/package.json" "${APP_ROOT}/vendor/semoss-ui/package.json"
rsync -a --delete "${UI_ROOT}/dist/" "${APP_ROOT}/vendor/semoss-ui/dist/"
# The published stylesheet scans ../src for component utility classes.
rsync -a --delete "${UI_ROOT}/src/" "${APP_ROOT}/vendor/semoss-ui/src/"

APP_ROOT_ENV="${APP_ROOT}" node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const appRoot = process.env.APP_ROOT_ENV;
const packagePath = path.join(appRoot, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
packageJson.dependencies["@semoss/ui"] = "file:vendor/semoss-ui";
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

const lockPath = path.join(appRoot, "package-lock.json");
if (fs.existsSync(lockPath)) {
  const replacePath = (value) => {
    if (Array.isArray(value)) return value.map(replacePath);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key.replaceAll("../../libs/ui", "vendor/semoss-ui"),
          replacePath(child),
        ]),
      );
    }
    return typeof value === "string"
      ? value.replaceAll("../../libs/ui", "vendor/semoss-ui")
      : value;
  };
  const lockJson = replacePath(JSON.parse(fs.readFileSync(lockPath, "utf8")));
  fs.writeFileSync(lockPath, `${JSON.stringify(lockJson, null, 2)}\n`);
}
NODE

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
