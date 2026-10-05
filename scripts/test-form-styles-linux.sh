#!/bin/sh
# Run the stylesheet layout checks (tests/form-styles.test.mjs) on Linux, as the CI runner
# does: WebKit through Playwright, and Chromium and Firefox through Puppeteer, in the official
# Playwright image of the version the workspace pins, for linux/amd64.
#
# The working tree is mounted read-only and copied (tracked and untracked files that are not
# ignored) into the container; dependencies are installed there, so nothing of the host's
# node_modules is used. The Node.js archive of .node-version, checked against the SHA-256 of
# config/toolchain.json, and the npm downloads are cached under node_modules/.cache/crudui/linux-styles;
# Chrome and Firefox are installed on every run at the builds that puppeteer pins, as CI installs
# them (scripts/install-browsers.mjs), since the cache mount keeps no symbolic links. The tests run
# as the image's unprivileged user with the set-user-ID sandbox helper of that Chrome, as CI does.
#
# The image takes about 10 GB and every checkout of the user account uses the same one, so a run
# keeps it. The container runs under the user-wide holder lock of the image
# (scripts/holder-lock.mjs): a second run is refused with the holder's checkout, pid and process
# start time. `--remove-image` removes the image under the same lock, so it is refused while a
# check runs.
#
# It uses the `container` command line tool on macOS, or `docker` elsewhere; set
# CRUDUI_CONTAINER to choose. Extra arguments replace the test files to run.
#
#   make test-form-styles-linux
#   sh scripts/test-form-styles-linux.sh tests/form-styles.test.mjs
#   make remove-form-styles-image
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
VERSION=$(node -p "require('$ROOT/node_modules/playwright/package.json').version")
IMAGE="mcr.microsoft.com/playwright:v$VERSION-noble"
LOCK=$(node "$ROOT/scripts/holder-lock.mjs" user-lock-file "playwright-v$VERSION-noble")
NODE_VERSION=$(cat "$ROOT/.node-version")
NODE_SHA256=$(node -p "require('$ROOT/config/toolchain.json').node['linux-x64.tar.gz']")
CACHE="$ROOT/node_modules/.cache/crudui/linux-styles"
mkdir -p "$CACHE"
TOOL=${CRUDUI_CONTAINER:-$(command -v container >/dev/null 2>&1 && echo container || echo docker)}
if [ "$TOOL" = container ]; then PLATFORM="--platform linux/amd64 --rosetta"; else PLATFORM="--platform linux/amd64"; fi
if [ $# -eq 0 ]; then set -- tests/form-styles.test.mjs; fi

# shellcheck disable=SC2016
INNER='
set -eu
export HOME=/cache/home npm_config_cache=/cache/npm PUPPETEER_CACHE_DIR=/opt/puppeteer
# The sandbox helper of the pinned Chrome, as the CI jobs set it.
export CHROME_DEVEL_SANDBOX=/usr/local/sbin/chrome-devel-sandbox
mkdir -p "$HOME" /work /cache/node
# The Node.js release of .node-version; the archive is cached and checked against its recorded
# SHA-256, the installation is not cached (the cache mount keeps no symbolic links).
tarball="node-v$NODE_VERSION-linux-x64.tar.gz"
if [ ! -f "/cache/node/$tarball" ]; then
  curl -fsSL -o "/cache/node/$tarball.part" "https://nodejs.org/dist/v$NODE_VERSION/$tarball"
  mv "/cache/node/$tarball.part" "/cache/node/$tarball"
fi
echo "$NODE_SHA256  /cache/node/$tarball" | sha256sum -c - >/dev/null || { echo "/cache/node/$tarball does not have the SHA-256 $NODE_SHA256 of config/toolchain.json" >&2; exit 1; }
mkdir -p /opt/node && tar -xzf "/cache/node/$tarball" --strip-components=1 -C /opt/node
export PATH="/opt/node/bin:$PATH"
git config --global --add safe.directory /repo
cd /repo && git ls-files -z --cached --others --exclude-standard | while IFS= read -r -d "" file; do [ -e "$file" ] && printf "%s\0" "$file"; done | tar --null -T - -cf - | tar -xf - -C /work
cd /work
node scripts/install-npm.mjs
export PATH="/work/.tools/npm/node_modules/.bin:$PATH"
npm ci --strict-allow-scripts --no-audit --no-fund --loglevel=error
apt-get install -y -qq xz-utils >/dev/null
node scripts/install-browsers.mjs chrome firefox --chrome-sandbox
node scripts/require-current-build.mjs
# Chrome refuses to run as root with its sandbox; the CI runner does not run as root either.
chown -R pwuser /work
exec setpriv --reuid=pwuser --regid=pwuser --init-groups env HOME=/tmp/pwuser node scripts/run-tests.mjs node -- "$@"
'

if [ "$*" = --remove-image ]; then
  if [ "$TOOL" = container ]; then REMOVE="image delete"; else REMOVE="image rm"; fi
  # shellcheck disable=SC2086
  exec node "$ROOT/scripts/holder-lock.mjs" hold "$LOCK" -- "$TOOL" $REMOVE "$IMAGE"
fi

exec node "$ROOT/scripts/holder-lock.mjs" hold "$LOCK" -- \
  "$TOOL" run --rm $PLATFORM --memory 8g --cpus 4 \
  --mount "type=bind,source=$ROOT,target=/repo,readonly" \
  --mount "type=bind,source=$CACHE,target=/cache" \
  -e "NODE_VERSION=$NODE_VERSION" -e "NODE_SHA256=$NODE_SHA256" \
  "$IMAGE" bash -c "$INNER" inner "$@"
