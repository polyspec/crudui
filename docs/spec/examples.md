# Examples

[한국어](examples.ko.md).

Current examples use unversioned public APIs. `examples/cross-check-console`
compares validation and rendering results across implementations. Form usage is
defined in [form operations](../operations/forms.md).

The console accepts a validator response only when the process terminates with
the expected exit status and emits a JSON object matching the response contract.
Data validation uses exit status `0`, boolean `valid` and an `errors` array.
Each error has string `path`, `field`, `rule` and `message` members and a `value`
member. `valid` is true exactly when the error array is empty. Missing fields,
invalid types, contradictory results, process errors and signals fail comparison;
the console does not fill missing fields or convert invalid values.

Specification load failures are checked separately from data results. The current
JavaScript and Go CLIs exit with `1`, and Rust exits with `2`, with nonempty
string `code` and `error` members. The PHP CLI exits with `0` and returns one
complete error with `valid: false`, `rule: "compose"`, nonempty string `code` and
`message`, empty `path` and `field`, and `value: null`. A load response with
another exit status or malformed fields fails comparison.

Historical implementation comparisons run in an independent external workspace.
That workspace preserves the source commits, container build inputs, HTTP
applications and verification reports. Package tests do not import its files.
Reusable form inspection and JSON order checks are maintained under
`tests/form-inspector/` and `tests/ordered-json/`.

Examples using the legacy specification or legacy API are stored under
`examples/legacy`. Their application code imports explicit legacy entries.
Their dependencies, build contexts and documentation resolve from that directory.
The main example index identifies the current entry points separately from
legacy demonstrations. Relocation does not establish successful verification;
implementation status records checks separately.

PHP example classes use one PSR-4 class per matching source file. Composer
optimized autoload generation must not exclude application classes.

Controlled legacy React forms notify the parent once per field change, outside
React state updater functions. Consecutive changes preserve previous field values.

Frontend examples import repository-local specifications during the application
build. The resulting static application includes its form specifications.

Controlled example parents apply the complete data object returned by the form
change callback, preserving nested objects and repeated collections.

The external comparison environment uses Compose for its image, resources,
mounts and startup health check. `containerctl up` reuses unchanged containers
and serves local HTTPS. Repeated application of the same configuration must
preserve storage, routes and application responses.
