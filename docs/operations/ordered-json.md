# Verify JSON document order
<!-- doc-id: docs-operations-ordered-json -->

[한국어](ordered-json.ko.md). The [form runtime contract](../spec/form-runtime.md)
defines the required data shapes and order. [Feature status](../features.md)
records verification separately from runtime deployment.

The record servers of the [form comparison](../spec/form-comparison.md) read and write JSON with the
packages of [OrderedJSON](https://github.com/polyspec/ordered-json) at the tag `v0.0.3`, which
`make install-ordered-json` checks out: `@polyspec/ordered-json` in JavaScript, its Go module, its Rust crate,
`Polyspec\OrderedJson` in PHP and the `ordered_json` extension of its `php-extension` package. OrderedJSON's own
parity check and tests verify the processor across its five implementations; crudui does not repeat them. crudui
tests its use of the packages: `examples/form-comparison/src/json.test.mjs`, `test-json.php`, `json_test.go` of the Go
server and the JSON tests of the Rust server check that a record keeps its member order, numeric keys and keyed rows
included, and its empty types, and that a number outside the form data range fails.

The transport modules of the form comparison use the processor for JSON requests, responses and repository
files. The processor returns `Value`
nodes; its JavaScript object members are a `Map`, while the form session accepts
record data. Numeric member order would be lost if these maps were converted to
ordinary JavaScript objects; the form conversion rejects such a change. Existing delimited 13-character row keys are not
integer index properties and retain their insertion order in the current session.

The form and JSON transmission choices run the same validator and repository.
The [form checks](testing.md#forms-and-reports) cover runtime integration: the record-store
HTTP contract sends multipart, URL-encoded and JSON saves and invalid requests to every record
server, and the canonical flow check types into and saves the form of every server, client and
initialization and reloads the list.
