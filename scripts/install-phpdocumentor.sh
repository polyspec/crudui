#!/bin/sh
set -eu

version=3.10.0
expected=fe1e7c23ba3329aa6f19ac3c807446159a431a195ec5d9163b0c281a15105207
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
destination="$root/tools/bin/phpDocumentor.phar"
temporary=$(mktemp "${TMPDIR:-/tmp}/crudui-phpdocumentor.XXXXXX")
trap 'rm -f "$temporary"' EXIT HUP INT TERM

curl --proto '=https' --tlsv1.2 --fail --location --silent --show-error \
  "https://github.com/phpDocumentor/phpDocumentor/releases/download/v$version/phpDocumentor.phar" \
  --output "$temporary"

if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$temporary" | awk '{print $1}')
else
  actual=$(shasum -a 256 "$temporary" | awk '{print $1}')
fi
if [ "$actual" != "$expected" ]; then
  echo "phpDocumentor SHA-256 mismatch: expected $expected, received $actual" >&2
  exit 1
fi

mkdir -p "$(dirname -- "$destination")"
mv "$temporary" "$destination"
trap - EXIT HUP INT TERM
php "$destination" --version
