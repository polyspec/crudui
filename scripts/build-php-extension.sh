#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root/packages/php-ext"
phpize
./configure --enable-crudui
make -j"${CRUDUI_BUILD_JOBS:-2}"
php -n -d "extension=$project_root/packages/php-ext/modules/crudui.so" --ri crudui
