# Input text fixtures

[한국어](README.ko.md).

These cases define the [input text](../../../docs/spec/input-text.md) rule: every string and
object member name of a specification, a composition file and caller data is a sequence of
Unicode scalar values, and an operation rejects any other text before its other checks.

Each directory holds the `cases.json` of one operation: `validate`, `validateList`,
`validateDetail`, `compileForm`, `bindForm`, `createForm`, `buildList` and `buildDetail`. The
files are JSON text that writes unpaired surrogates as escapes, such as `"\ud800"`, a lone low
surrogate and the reversed pair `"\udc00\ud800"`, in string values, member names, arrays, nested
rows, composition files and options. A decoder that replaces or refuses these escapes cannot read
the files; each consumer reads them with the decoder the specification names for its runtime.

A case has `name`, `note` and `expect`, and the inputs of its operation:

- `spec`, and `files` for the validation operations;
- `data` (validation, binding and instances), `rows` (lists) or `record` (details);
- `options`, whose `files` member holds the composition files of the generation operations;
- `template`, a template given as JSON text instead of the one compiled from `spec`;
- `action`, one `{ method, args }` call on a created form, whose result is the expectation.

`expect` is the failure `{ code, message, at }`, or the result of a case that passes: the
validation result `{ valid, errors }` for the validation operations and `"pass"` for the
generation operations. Cases with valid surrogate pairs and characters from U+E000 to U+FFFF
check that valid text passes and that members follow code point order.

## Value graphs

`value-graphs.json` holds the cases of the value limits: a value walked as the tree it denotes
holds at most 1,000,000 nodes and nests at most 512 levels, and a value that contains itself is
beyond them. JSON text cannot share a container, so each case describes its value graph in
`graph`, and each consumer builds it with its own containers and places it at `graph.at`, a path
that starts with `spec`, `files` or `data`, in the case's `validate` inputs. The shapes are:

- `doubled`: `leaf` in a list that holds the previous value twice, `size` times over;
- `chain`: `leaf` in `size` nested lists;
- `flat`: one list of `size` items that are `leaf`;
- `self-twice`: an object whose members `self` and `again` are the object itself, a PHP array
  that holds two references to itself.

Every case runs as one test within the runner's per-test limit; a walk that grows with the tree a
value denotes (2^40 nodes for a shared list forty levels deep) does not finish within it. Wall-clock
thresholds are not asserted, since a machine's speed would decide them.
The TypeScript, PHP, Go and PHP extension consumers run them. A Rust value owns its nodes and
cannot share one, so Rust does not.

## Consumers

The validation operations are run by the
[TypeScript](../../../packages/validator-ts/src/text/text-validity.conformance.test.ts),
[PHP](../../../packages/validator-php/tests/Validate/TextValidityConformanceTest.php),
[Go](../../../packages/validator-go/validator/validate/text_conformance_test.go) and
[Rust](../../../packages/validator-rust/tests/text_validity_conformance.rs) tests, the
[PHP extension runner](../../../packages/php-ext/tests/validate.php) through its
[API test](../../../packages/php-ext/tests/api.test.mjs), and the cross-check console
[validator process test](../../../examples/cross-check-console/server/validator-processes.test.mjs),
which sends every case to the five validator processes.

The generation operations are run in process by the
[generator core test](../../../packages/generator-core/src/input-text.test.ts) and through every
program by the [native generator suite](../../native-generators/README.md), which records the
evidence of the JavaScript, PHP, Go, Rust and PHP extension runtimes.

Byte strings that are not UTF-8 cannot be written in JSON text. The PHP, Go, Rust decoder and PHP
extension tests check them directly, and the programs reject standard input that is not UTF-8.

## Changing cases

The cases are written by hand. Keep one expectation per case and run every consumer after a
change.
