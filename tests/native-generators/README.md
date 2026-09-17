# Native generator conformance

[한국어](README.ko.md).

The suite executes the JavaScript reference (React server rendering), the JavaScript HTML
renderer, PHP, Go, Rust and the native PHP extension. It
requires the native module's absolute file path. Missing targets, failed
processes, malformed responses and failed comparisons make the command fail.
The report records unavailable targets separately and continues available
checks to collect their actual results.

```sh
node scripts/require-current-build.mjs
generator_php=packages/generator-php
composer install --working-dir="$generator_php"
node scripts/run-tests.mjs node --timeout 10 -- tests/native-generators/protocol.test.mjs
node tests/native-generators/run.mjs \
  --extension /absolute/path/to/crudui.so \
  --report .git/native-generators/report.json
```

## Progress, time budgets and selection

The run reports itself while it runs. Every line carries the elapsed time since the
start: the input hashing, each target's preparation, each check group as it starts and
when it finishes with its pass count and duration, a line every five seconds for a
group or check that is still running, and each target's total.

```
[    0.1s] inputs: 561 files hashed (0.1s)
[    0.1s] targets: php, go; checks matching list, dates
[    0.1s] php: preparing
[    0.2s] php: prepared (0.1s)
[    0.2s]   php · list: running
[    4.0s]   php · list: 44/44 passed (3.7s)
[    5.0s] php: 47/47 checks passed (4.9s)
```

Each check carries its own time budget, sized from the measured duration of the
slowest check in its group: 20 s for a form fixture, a form instance or a timezone
case (measured 385 ms, 335 ms and 282 ms) and 10 s for every other group (measured
under 130 ms). Preparation, which builds the Go and Rust generators, carries 300 s and
900 s. A check that exceeds its budget is stopped together with every process it
started, is reported by id and fails the run; the run continues with the next check,
so one stuck check never stops the report.

While developing one target or one area, run only its checks. The complete suite is
run once when the change is complete. The commands below run, in order, only the Rust
target, only the list and detail checks of the Go and native PHP targets, and the form
fixtures whose id contains `lang` (`*` matches any text).

```sh
node tests/native-generators/run.mjs --extension /absolute/crudui.so --target rust
node tests/native-generators/run.mjs --extension /absolute/crudui.so \
  --target go,php-native --check list,detail
node tests/native-generators/run.mjs --extension /absolute/crudui.so \
  --check 'form-fixture:*lang*'
```

`--target` accepts `javascript`, `html`, `php`, `go`, `rust` and `php-native`.
`--check` accepts a group name (`form-fixture`, `list`, `detail`, `number`,
`instance`, `request`, `reject`, `compile-reject`, `member-order`, `bindForm-option-reject`,
`form-option-reject`, `bindForm-shape-reject`, `form-shape-reject`, `dates`, `text`), a
complete check id or a pattern with `*`. Both flags accept comma-separated values and
may be repeated. A selection that matches no check fails, and the report records the
selection so a filtered run is not mistaken for a complete one.

Go and Rust executables are built by the suite. `PHP`, `GO` and `CARGO` can select
the corresponding installed commands. The extension must register native
`CRUDUI\Generator`, `CRUDUI\Validator` and `CRUDUI\Form` classes. Reflection
requires all three classes to be internal for native PHP and user-defined for
pure PHP. PHP signature and lifetime checks are maintained separately. Source
and built artifact hashes must remain unchanged throughout the run; the report
records both input manifests. Source directories are read directly, so Git is
not required. `--source-commit` or `CRUDUI_SOURCE_COMMIT` can record an optional
source commit without changing the hash comparison.

The 104 form cases compare complete compiled templates and bound models.
Templates from each target are bound by JavaScript and JavaScript templates are
bound by each target without composition loaders or files. Specification member order and control attribute order are
compared, and models are compared in member order. The 42 list cases compare original HTML strings, including
image resource hints, and their input error cases compare code, message and location.
Historical normalized layout tests remain separate. The 30
[detail cases](../fixtures/detail-render/README.md) compare both levels a runtime exposes:
the `buildDetail` model with its member order, and the original `renderDetail` HTML
including image resource hints. Error cases compare code, message and location at both
levels.

Additional cases compare keyed data in sequence order 5, 7, 1, scoped additions,
reordering, saved-key replacement, rejected operations, empty collections,
explicit null, selections, classes, CSS and raw HTML after injection and
restoration. Each injection case starts with an empty record, then applies the
record twice and compares each result with initial-data construction. Numeric cases have explicit decimal results rather than accepting
the JavaScript result as the only expectation. Invalid operations must retain
data, fields, HTML and revision.

A `multiple: only` collection holds exactly its data rows in data order, missing data is zero
rows, it renders no row controls, and each row operation on it fails with `INVALID_FORM_INPUT` and
`Rows of variants come only from data` while the data and HTML stay as they were. A group hidden
by `design.show` keeps its values while hidden, including a value set then, and renders them when
shown again. These expectations are written from the specification in the suite, in addition to
the comparison with JavaScript. Compilation rejects `multiple` other than a boolean, `only` or an
object, a non-boolean `multiple.only`, and each of `min`, `max`, `copy`, `sortable`, `controls`
and `onclick` beside `only: true` as an unknown key.

Date cases run in UTC, Asia/Seoul and America/Los_Angeles. The suite sets both
`TZ` and PHP's `date.timezone`, compares explicit UTC date/datetime/list results,
and checks initial data, empty-instance injection, clearing and restoration.
Invalid calendar values and unsupported strings retain their original values.

Nested copying checks every actual generated key, copied value, row order and
unchanged original record. The generated record is then supplied unchanged to
JavaScript and to a second native instance; their complete models and original
HTML must match. The suite does not rewrite random keys or remove identifiers,
values, attributes or HTML from a comparison.

## Programs

Each runtime answers through one program beside this suite. No package publishes these
programs; each one calls only its package's public API.

| Target | Program | Library |
| --- | --- | --- |
| `javascript`, `html` | [`javascript.mjs`](javascript.mjs) (`--renderer html` selects the HTML renderer) | `@crudui/generator-core` with `@crudui/generator-react` or `@crudui/generator-html` |
| `php`, `php-native` | [`programs/php/generate.php`](programs/php/generate.php) | `crudui/generator` through the Composer autoloader of `packages/generator-php`; with the extension loaded, the extension's classes |
| `go` | [`programs/go`](programs/go/main.go) (module with its own `go.mod`) | `packages/generator-go` |
| `rust` | [`programs/rust`](programs/rust/src/main.rs) (crate `crudui-native-generator`) | `crudui-generator` |

The suite builds the Go program into its build directory and the Rust program with
`cargo build --locked` in `programs/rust`. Their formatting and static checks:

```sh
gofmt -l tests/native-generators/programs/go
go -C tests/native-generators/programs/go vet ./...
node scripts/run-rust-command.mjs fmt --check --manifest-path tests/native-generators/programs/rust/Cargo.toml
node scripts/run-rust-command.mjs clippy --locked --all-targets --manifest-path tests/native-generators/programs/rust/Cargo.toml -- -D warnings
```

Each program reads one JSON value on stdin. Operations are `compileForm`, `bindForm`,
`bindButtons`, `formButtonsHtml`, `form`, `renderList`, `buildList`, `buildDetail` and
`renderDetail`. A successful response exits with status 0; a top-level operation error is
`{ "error": { "code", "message", "at" } }` and exits with status 1. JSON decides the type
of every input before a library call, and each boundary failure is `INVALID_FORM_INPUT`
with an empty `at`:

| Input | Message |
| --- | --- |
| standard input is not UTF-8 or not one JSON value | `Request must be valid JSON` |
| the request is not an object | `Request must be an object` |
| `options` is present and not an object | `Options must be an object` |
| `data` is present and not an object | `Form data must be an object` |
| `operation` is none of the operations | `Unknown generator operation` |
| the `compileForm` `spec` is not an object | `A form spec must be a group with properties` |
| the `bindForm`, `bindButtons` or `form` `template` is not exactly the compiled template shape | `Unsupported form template` |
| the `form` `actions` is present and not an array | `Actions must be an array` |

A form action that is not an object, names no form method or has no `args` array fails
its step with `Invalid form action`. Every action failure is recorded in its step and
execution continues. The `request` checks run the same standard input through every
program and require the JavaScript result, or its error code, message and location.

The `text` checks send every case of
[`tests/fixtures/text-validity`](../fixtures/text-validity/README.md) for `compileForm`,
`bindForm`, `createForm` (the `form` operation, with the case's action), `buildList` and
`buildDetail` as JSON text with unpaired surrogate escapes, and require the case's
[input text](../../docs/spec/input-text.md) failure or success. Each program keeps that text
while decoding: JavaScript with `JSON.parse`, PHP with `JsonText::decode`, Go with
`generator.DecodeJSON` and `generator.CheckBindText` before template decoding, and Rust with
`JsonText`, whose shape serves the protocol rules while `crudui_generator::text` checks each
operation's text first. A last check sends standard input that is not UTF-8.
Error code, message and location must match in every implementation, as must preserved
state.
