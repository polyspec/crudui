# Native generation checks

[한국어](native-generators.ko.md).

Run commands from the repository root. PHP, Go and Rust provide independent form
and list generators. The PHP extension uses the common PHP classes and performs
generation and validation in native code. The [runtime contract](../spec/runtime-packages.md)
defines the required operations and comparisons.

## Local build and tests

Use a 64-bit PHP installation with matching `phpize`, `php-config` and development
headers. Pure PHP requires PHP 8.2 or later; the extension requires PHP 8.4 or
later. Install Composer, Node, Go, Cargo and a C compiler. The container below
provides a complete Linux toolchain.

```sh
npm ci
composer install --working-dir=packages/validator-php --no-interaction --prefer-dist
composer install --working-dir=packages/generator-php --no-interaction --prefer-dist
make test-native
make docs-check
```

`make test-native` builds and loads the extension, builds the JavaScript packages,
runs generator package tests and compares JavaScript, PHP, Go, Rust and native PHP.
The native module uses PHP's standard `phpize`, configure and make procedure and
Cargo's locked dependency graph.

The PHP API check uses three separate processes: Composer classes, the extension
without Composer, and the extension with Composer. Reflection verifies the actual
class implementation and all public method signatures. The shared generator
suite compares templates, evaluated fields, data, row operations and original
HTML. It records hashes before and after execution and fails if an input changes.

The default report is `.git/native-generators/report.json`. `NATIVE_REPORT` selects
another report path. The [suite procedure](../../tests/native-generators/README.md)
describes direct invocation with an explicit extension path and the comparison
protocol. Missing executables, missing native classes and malformed responses
fail the checks.

Browser widget checks execute generated selectors and callbacks in Chromium.
Host editor functions verify their received selectors and arguments; these tests
do not install or verify the external editor implementations.

## Apple container

The container definition includes PHP 8.4 and its development headers, Node
26.8.1, Go 1.27.0, Rust 1.98.0, Composer and Chromium. Build from the complete
repository context. Generated host dependencies and binaries are excluded.
Dependencies are installed from the package lock files inside the image.

```sh
container build --cpus 4 --memory 4g \
  --file tests/containers/native.Containerfile \
  --tag localhost/crudui-native-check:0.0.1 .
container run --rm --cpus 4 --memory 4g \
  localhost/crudui-native-check:0.0.1
```

The image's default command runs `make test-native`. For a retained report, run a
named container without `--rm` and copy `/tmp/crudui-native-report.json` before
removing that container. A successful image build establishes compilation and
module loading; the test command establishes the recorded comparisons.

## HTTP and browser verification

Package examples demonstrate each language's library. The
[form verification procedure](verification.md) defines the separate PHP,
native PHP, Go and Rust HTTP targets with React, Vue and Svelte. Verify both form
and ordered JSON submission, invalid requests, persistence and reload.

A browser-generated form with a PHP, Go or Rust validation endpoint does not
establish server rendering. A server rendering result must identify the runtime
that compiled, bound and rendered it. Record the exact source, test results and
deployment separately in [feature status](../features.md).
