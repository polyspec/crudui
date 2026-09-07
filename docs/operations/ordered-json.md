# Verify JSON document order

[한국어](ordered-json.ko.md). The [form comparison example contract](../spec/form-comparison.md)
defines the required data shapes and order. [Feature status](../features.md)
records verification separately from runtime deployment.

The check uses an explicit checkout of
[ordered-json](https://github.com/ordered-json/ordered-json/tree/deb1b354da845e4c44d1e35c28c77bdb02ec174b)
at commit `deb1b354da845e4c44d1e35c28c77bdb02ec174b`. This revision's package name is
`sortjson`. The check rejects a different revision or modified source.

Set `ORDERED_JSON_SOURCE` to an absolute checkout path. Run from the CRUDUI root
with Node, PHP, PHP extension build tools, Go, Rust and Python installed:

```sh
ORDERED_JSON_SOURCE=/absolute/path/to/ordered-json
git clone https://github.com/ordered-json/ordered-json "$ORDERED_JSON_SOURCE"
git -C "$ORDERED_JSON_SOURCE" checkout deb1b354da845e4c44d1e35c28c77bdb02ec174b
python3 "$ORDERED_JSON_SOURCE/scripts/test.py" --build-extension
python3 examples/form-comparison/check-ordered-json.py "$ORDERED_JSON_SOURCE"
make docs-check
```

For an existing checkout, omit the clone command. The first Python command builds
the PHP extension and runs the processor's 17 official examples and 98 syntax
cases against all five implementations. The second runs ten CRUDUI JSON
documents through those implementations' parse, serialize and reconstruct APIs.
An independent Python decoder retains object pairs and number tokens for comparison.
The checker compares complete ordered trees; it does not sort object members.

Reports are saved as `.form-comparison/results/ordered-json-<timestamp>.json`.
They include the source revision, checker and fixture hashes, and individual
results. Previous reports remain available. A failed case returns exit status 1.

The inserted, copied and saved-key cases are JSON fixtures. They verify transport
representation, not execution of form buttons or database operations. The
example's transport modules use the processor for JSON requests, responses
and repository files. The processor returns `Value`
nodes; its JavaScript object members are a `Map`, while the form session accepts
record data. Numeric member order would be lost if these maps were converted to
ordinary JavaScript objects; the form conversion rejects such a change. Existing delimited 13-character row keys are not
integer index properties and retain their insertion order in the current session.

The form and JSON transmission choices run the same validator and repository.
Run the [browser and PHP persistence checks](form-comparison.md) for runtime integration:
they execute both transmission choices, actual input and button actions,
invalid-request rejection, equivalent stored data and fresh reloads. The
processor-only result remains separate from these integration results.
