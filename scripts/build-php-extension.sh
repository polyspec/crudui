#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root/packages/php-ext"
rm -rf \
  .libs autom4te.cache build include modules native/.libs target/release/build \
  Makefile Makefile.fragments Makefile.objects \
  config.cache config.h config.h.in config.h.in~ config.log config.nice \
  config.status configure configure.ac configure~ confdefs.h libtool \
  crudui.la run-tests.php \
  native/errors.dep native/errors.lo native/crudui.dep native/crudui.lo \
  native/values.dep native/values.lo
phpize
./configure --enable-crudui
mkdir -p native/.libs
make -j"${CRUDUI_BUILD_JOBS:-2}"
php -n -d "extension=$project_root/packages/php-ext/modules/crudui.so" --ri crudui
