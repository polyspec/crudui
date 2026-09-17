#!/bin/sh
# Run the stylesheet layout checks (tests/form-styles.test.mjs) on Linux, as the CI runner
# does: WebKit through Playwright, and Chromium and Firefox through Puppeteer, in the official
# Playwright image of the version the workspace pins, for linux/amd64.
#
# The working tree is mounted read-only and copied (tracked and untracked files that are not
# ignored) into the container; dependencies are installed there, so nothing of the host's
# node_modules is used. The Node.js archive and the npm downloads are cached under
# node_modules/.cache/crudui/linux-styles; Google Chrome and Firefox are installed on every run,
# since the cache mount keeps no symbolic links. Chrome is at the path the CI runner has, and
# the tests run as the image's unprivileged user, as Chrome's sandbox requires.
#
# It uses the `container` command line tool on macOS, or `docker` elsewhere; set
# CRUDUI_CONTAINER to choose. Extra arguments replace the test files to run.
#
#   make test-form-styles-linux
#   sh scripts/test-form-styles-linux.sh tests/form-styles.test.mjs
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
VERSION=$(node -p "require('$ROOT/node_modules/playwright/package.json').version")
IMAGE="mcr.microsoft.com/playwright:v$VERSION-noble"
NODE_LINE=$(cat "$ROOT/.node-version")
CACHE="$ROOT/node_modules/.cache/crudui/linux-styles"
mkdir -p "$CACHE"
TOOL=${CRUDUI_CONTAINER:-$(command -v container >/dev/null 2>&1 && echo container || echo docker)}
if [ "$TOOL" = container ]; then PLATFORM="--platform linux/amd64 --rosetta"; else PLATFORM="--platform linux/amd64"; fi
if [ $# -eq 0 ]; then set -- tests/form-styles.test.mjs; fi

# shellcheck disable=SC2016
INNER='
set -eu
export HOME=/cache/home npm_config_cache=/cache/npm PUPPETEER_CACHE_DIR=/opt/puppeteer
# Google Chrome at the path the CI runner has, as the workflow sets it.
export PUPPETEER_SKIP_DOWNLOAD=true PUPPETEER_EXECUTABLE_PATH=/opt/google/chrome/chrome
mkdir -p "$HOME" /work /cache/node
# The Node.js release line of .node-version; the archive is cached, the installation is not
# (the cache mount keeps no symbolic links).
tarball=$(curl -fsSL "https://nodejs.org/dist/latest-v$NODE_LINE.x/SHASUMS256.txt" | awk "/linux-x64.tar.gz\$/ { print \$2 }")
[ -f "/cache/node/$tarball" ] || curl -fsSL -o "/cache/node/$tarball" "https://nodejs.org/dist/latest-v$NODE_LINE.x/$tarball"
mkdir -p /opt/node && tar -xzf "/cache/node/$tarball" --strip-components=1 -C /opt/node
export PATH="/opt/node/bin:$PATH"
git config --global --add safe.directory /repo
cd /repo && git ls-files -z --cached --others --exclude-standard | while IFS= read -r -d "" file; do [ -e "$file" ] && printf "%s\0" "$file"; done | tar --null -T - -cf - | tar -xf - -C /work
cd /work
npm ci --strict-allow-scripts --no-audit --no-fund --loglevel=error
npx --no-install playwright install chrome >/dev/null
apt-get install -y -qq xz-utils >/dev/null
FIREFOX=$(npx --no-install puppeteer browsers install firefox@stable | tail -1 | cut -d" " -f2-)
export CRUDUI_FIREFOX_EXECUTABLE="$FIREFOX"
node scripts/require-current-build.mjs
# Chrome refuses to run as root with its sandbox; the CI runner does not run as root either.
chown -R pwuser /work
exec setpriv --reuid=pwuser --regid=pwuser --init-groups env HOME=/tmp/pwuser node scripts/run-tests.mjs node -- "$@"
'

exec "$TOOL" run --rm $PLATFORM --memory 8g --cpus 4 \
  --mount "type=bind,source=$ROOT,target=/repo,readonly" \
  --mount "type=bind,source=$CACHE,target=/cache" \
  -e "NODE_LINE=$NODE_LINE" \
  "$IMAGE" bash -c "$INNER" inner "$@"
