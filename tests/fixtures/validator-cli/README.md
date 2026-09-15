# Validator command-line requests

[한국어](README.ko.md).

`cases.json` defines how every validator command-line adapter (JavaScript, PHP, Go and Rust) answers
a request before and around validation. Each case has `name`, `note`, the raw stdin text `input`
and `expected: { exit, output }`, where `output` is the complete JSON object written to stdout.

A malformed request exits `1` with `{ "error" }`. The rules are checked in this order:

| Rule | Message |
| --- | --- |
| stdin is valid JSON | `Request must be valid JSON` |
| the request is an object | `Request must be an object` |
| `spec` is an object | `Request spec must be an object` |
| `mode` is absent, `form`, `list` or `detail` | `Unsupported validation mode` |
| `files` is absent, `null` or an object | `Request files must be an object` |
| every `files` member is an object | `Request files must contain objects` |
| `basepath` is absent, `null` or a string | `Request basepath must be a string` |

Form data that is present and not an object is an input failure (exit `2`). List and detail modes
ignore `data`. The cross-check console test `validator-cli-requests.test.mjs` runs every case in the
four adapters.
