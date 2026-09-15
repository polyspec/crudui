# Verify JSON document order

[한국어](ordered-json.ko.md). The [form runtime contract](../spec/form-runtime.md)
defines the required data shapes and order. [Feature status](../features.md)
records verification separately from runtime deployment.

The check uses one explicit checkout of
[OrderedJSON](https://github.com/polyspec/ordered-json/tree/26c2aebc97896e280d3a6b8f5e8e1d85e2282b83)
version `0.0.1` at commit `26c2aebc97896e280d3a6b8f5e8e1d85e2282b83`. The five implementations
are package directories in that monorepo:

| Package | Manifest |
| --- | --- |
| `js` | `js/package.json` |
| `rust` | `rust/Cargo.toml` |
| `go` | `go/go.mod` |
| `php` | `php/composer.json` |
| `php-extension` | `php-extension/composer.json` |

The checker requires an absolute path, the exact monorepo revision and clean source
before and after execution. PHP uses the `OrderedJson` namespace;
the native target is `php-extension` and loads `ordered_json.so`.

Set `ORDERED_JSON_SOURCE` to an absolute checkout path. Run from the CRUDUI root
with Node, PHP, PHP extension build tools, Go, Rust and Python installed:

```sh
ORDERED_JSON_SOURCE=/absolute/path/to/ordered-json
git clone --no-checkout https://github.com/polyspec/ordered-json "$ORDERED_JSON_SOURCE"
git -C "$ORDERED_JSON_SOURCE" checkout 26c2aebc97896e280d3a6b8f5e8e1d85e2282b83
python3 -m unittest discover -s tests/ordered-json -p 'test_*.py'
python3 "$ORDERED_JSON_SOURCE/scripts/verify.py"
python3 tests/ordered-json/check.py "$ORDERED_JSON_SOURCE"
make docs-check
```

For an existing checkout, omit the clone command. The unit checks verify failure
handling and incomplete-result detection. The official verifier builds
the adapters and PHP extension and runs 17 official examples and 98 shared
syntax cases against all five implementations. It does not replace the common
repository's aggregate or PIE verification records. The CRUDUI checker runs ten JSON
documents through those implementations' parse, serialize and reconstruct APIs.
An independent Python decoder retains object pairs and number tokens for comparison.
The checker compares complete ordered trees; it does not sort object members.
It uses `scripts/registry.py` to resolve repositories, build the selected adapters
and obtain their commands. Run these checks sequentially. An ordinary extension
build and a PIE artifact check must not run concurrently in the same checkout.

Reports are saved as `.verification/ordered-json/ordered-json-<timestamp>.json`.
They include the monorepo revision, package paths, checker and fixture hashes,
runtime versions, native module hash, build warnings and individual results.
Previous reports remain available. All five implementations and all 50 results
are required. A missing response, malformed output, process failure or failed
case produces a failed report and a nonzero exit status. Source or artifact
changes during verification also fail the check.

The inserted, copied and saved-key cases are JSON fixtures. They verify transport
representation, not execution of form buttons or database operations. The preserved external
example's transport modules use the processor for JSON requests, responses
and repository files. The processor returns `Value`
nodes; its JavaScript object members are a `Map`, while the form session accepts
record data. Numeric member order would be lost if these maps were converted to
ordinary JavaScript objects; the form conversion rejects such a change. Existing delimited 13-character row keys are not
integer index properties and retain their insertion order in the current session.

The form and JSON transmission choices run the same validator and repository.
Run the [browser and PHP persistence checks](verification.md) for runtime integration:
they execute both transmission choices, actual input and button actions,
invalid-request rejection, equivalent stored data and fresh reloads. The
processor-only result remains separate from these integration results.
