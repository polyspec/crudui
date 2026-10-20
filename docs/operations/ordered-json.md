# Verify JSON document order
<!-- doc-id: docs-operations-ordered-json -->

[한국어](ordered-json.ko.md). The [form runtime contract](../spec/form-runtime.md)
defines the required data shapes and order. [Feature status](../features.md)
records verification separately from runtime deployment.

The record servers of the [form comparison](form-comparison.md) read and write JSON with the
packages of [OrderedJSON](https://github.com/polyspec/ordered-json) 0.0.9: `@polyspec/ordered-json` in JavaScript
and the `ordered_json` extension of its `packages/php-ext` package from the checkout of the tag `v0.0.9` that
`make crudui-install-ordered-json` makes, the Go module `github.com/polyspec/ordered-json/packages/go` at `v0.0.9` and the
Rust crate `polyspec-ordered-json` of the Git tag `v0.0.9`. `Polyspec\OrderedJson` in PHP is the Composer package
`polyspec/ordered-json` of the release zip that `config/release-assets.json` pins, which `make crudui-install-composer`
downloads into the artifact repository `var/composer-artifacts` of the root `composer.json`. OrderedJSON's own
parity check and tests verify the processor across its five implementations; crudui does not repeat them. crudui
tests its use of the packages: `examples/form-comparison/src/json.test.mjs`, `FormJsonTest.php` of `servers/php`, `json_test.go` of the Go
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
