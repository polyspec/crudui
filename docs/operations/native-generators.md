# Native generation checks

[한국어](native-generators.ko.md).

Run commands from the repository root. PHP, Go and Rust provide independent form
and list generators. The PHP extension uses the common PHP classes and performs
generation and validation in native code. The [runtime contract](../spec/runtime-packages.md)
defines the required operations and comparisons.

## Local build and tests

Use a 64-bit PHP installation with `php-config` and matching development headers.
Pure PHP requires PHP 8.2 or later; the extension requires PHP 8.4 or later.
Install Composer, Node, Go, Cargo and a C compiler. The container below provides
a complete Linux toolchain.

```sh
npm ci --strict-allow-scripts
composer install --working-dir=packages/validator-php --no-interaction --prefer-dist
composer install --working-dir=packages/generator-php --no-interaction --prefer-dist
make test-native
make docs-check
```

`make test-native` builds the JavaScript packages, builds and loads the extension,
runs generator package tests and compares the JavaScript reference (React server rendering),
the JavaScript HTML renderer, PHP, Go, Rust and native PHP.
The extension build reads the PHP executable, headers and build flags from
`php-config`, compiles the C binding and links Cargo's locked Rust output directly.
It does not require `phpize`, Autoconf or libtool. Tool discovery rejects relative
paths, symbolic links and multiple results. Explicit tool paths must identify
regular executable files.
On Debian-derived Linux systems, compiler discovery reads the installed `gcc`
package record and selects one regular target compiler file. Set
`PHP_EXTENSION_PHP_CONFIG` to the regular versioned `php-config` file when more
than one PHP release can be selected.

The PHP API check uses three separate processes: Composer classes, the extension
without Composer, and the extension with Composer. Reflection verifies the actual
class implementation and all public method signatures. The shared generator
suite compares templates, evaluated fields, data, row operations, original HTML
and each rejection's complete code, message and location. It records hashes
before and after execution and fails if an input changes.

The default report is `native-generators/report.json` in the Git directory, resolved with
`git rev-parse --git-path`, so it also works in a worktree. `NATIVE_REPORT` selects another
report path. Before any check, `make test-native` reinstalls the validator copy in
`packages/generator-php`, so the PHP checks never load a copy older than its source. A passing run removes its temporary build directory. A failing
run keeps it, prints its path and records it as `buildDirectory` in the report. The [suite procedure](../../tests/native-generators/README.md)
describes direct invocation with an explicit extension path and the comparison
protocol. Missing executables, missing native classes and malformed responses
fail the checks.

Browser widget checks execute generated selectors and callbacks in Chromium.
Host editor functions verify their received selectors and arguments; these tests
do not install or verify the external editor implementations.

## Apple container

The container definition includes PHP 8.4 and its development headers, the Node
26 and Go 1.27 release lines, the stable Rust channel, Composer and Chromium.
Build from the complete repository context. Generated host dependencies and
binaries are excluded. Dependencies are installed from the package lock files
inside the image.

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
native PHP, Go and Rust HTTP targets with React, Vue, Svelte and the HTML renderer. Verify both form
and ordered JSON submission, invalid requests, persistence and reload.

A browser-generated form with a PHP, Go or Rust validation endpoint does not
establish server rendering. A server rendering result must identify the runtime
that compiled, bound and rendered it. Record the exact source, test results and
deployment separately in [feature status](../features.md).
