# Native generator conformance

[한국어](README.ko.md).

The suite executes the JavaScript reference (React server rendering), the JavaScript HTML
renderer, PHP, Go, Rust and the native PHP extension. It
requires the native module's absolute file path. Missing targets, failed
processes, malformed responses and failed comparisons make the command fail.
The report records unavailable targets separately and continues available
checks to collect their actual results.

```sh
npm run build
generator_php=packages/generator-php
composer install --working-dir="$generator_php"
node --test tests/native-generators/protocol.test.mjs
node tests/native-generators/run.mjs \
  --extension /absolute/path/to/crudui.so \
  --report .git/native-generators/report.json
```

Go and Rust executables are built by the suite. `PHP`, `GO` and `CARGO` can select
the corresponding installed commands. The extension must register native
`CRUDUI\Generator`, `CRUDUI\Validator` and `CRUDUI\Form` classes. Reflection
requires all three classes to be internal for native PHP and user-defined for
pure PHP. PHP signature and lifetime checks are maintained separately. Source
and built artifact hashes must remain unchanged throughout the run; the report
records both input manifests. Source directories are read directly, so Git is
not required. `--source-commit` or `CRUDUI_SOURCE_COMMIT` can record an optional
source commit without changing the hash comparison.

The existing 92 form cases compare complete compiled templates and bound models.
Templates from each target are bound by JavaScript and JavaScript templates are
bound by each target without composition loaders or files. Specification member order and control attribute order are
compared. The 42 list cases compare original HTML strings, including
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

Date cases run in UTC, Asia/Seoul and America/Los_Angeles. The suite sets both
`TZ` and PHP's `date.timezone`, compares explicit UTC date/datetime/list results,
and checks initial data, empty-instance injection, clearing and restoration.
Invalid calendar values and unsupported strings retain their original values.

Nested copying checks every actual generated key, copied value, row order and
unchanged original record. The generated record is then supplied unchanged to
JavaScript and to a second native instance; their complete models and original
HTML must match. The suite does not rewrite random keys or remove identifiers,
values, attributes or HTML from a comparison.

Each CLI accepts one JSON value on stdin. Operations are `compileForm`,
`bindForm`, `form`, `renderList`, `buildDetail` and `renderDetail`. A successful response exits with status 0;
a top-level operation error is `{ "error": { "code", "message", "at" } }` and
exits with status 1. A form action failure is included in its step and execution
continues. Error code, message and location must match in every implementation,
as must preserved state.
