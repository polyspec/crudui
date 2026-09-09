PHP_ARG_ENABLE([crudui], [whether to enable CRUDUI], [AS_HELP_STRING([--enable-crudui], [Enable native CRUDUI generation and validation])], [no])

if test "$PHP_CRUDUI" != "no"; then
  AC_PATH_PROG([CARGO], [cargo], [no])
  AS_IF([test "$CARGO" = "no"], [AC_MSG_ERROR([Cargo is required to build CRUDUI])])
  AC_MSG_CHECKING([for PHP 8.4 or later])
  crudui_php_version=$($PHP_CONFIG --vernum)
  AS_IF([test "$crudui_php_version" -lt 80400], [AC_MSG_ERROR([CRUDUI requires PHP 8.4 or later])])
  AC_MSG_RESULT([yes])
  AS_IF([test "$($PHP_EXECUTABLE -n -r 'echo PHP_INT_SIZE;')" != "8"], [AC_MSG_ERROR([CRUDUI requires 64-bit PHP])])
  PHP_NEW_EXTENSION([crudui], [native/crudui.c native/values.c native/errors.c], [$ext_shared])
  PHP_ADD_INCLUDE([$ext_srcdir/native])
  PHP_ADD_LIBRARY_WITH_PATH([crudui_engine], [$ext_srcdir/target/release], [CRUDUI_SHARED_LIBADD])
  PHP_ADD_LIBRARY([m], [1], [CRUDUI_SHARED_LIBADD])
  PHP_ADD_LIBRARY([pthread], [1], [CRUDUI_SHARED_LIBADD])
  case $host_os in
    darwin*)
      AC_ARG_VAR([MACOSX_DEPLOYMENT_TARGET], [Minimum macOS version (default 11.0)])
      : ${MACOSX_DEPLOYMENT_TARGET:=11.0}
      export MACOSX_DEPLOYMENT_TARGET
      PHP_ADD_LIBRARY([iconv], [1], [CRUDUI_SHARED_LIBADD])
      CRUDUI_SHARED_LIBADD="$CRUDUI_SHARED_LIBADD -framework CoreFoundation" ;;
    *) PHP_ADD_LIBRARY([dl], [1], [CRUDUI_SHARED_LIBADD]) ;;
  esac
  PHP_SUBST([CARGO])
  PHP_SUBST([CRUDUI_SHARED_LIBADD])
  PHP_ADD_MAKEFILE_FRAGMENT
fi
