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

Load and input failures are checked separately from data results. Every validator
CLI exits with `2` and returns exactly the members `error` and `code` as nonempty
strings and `at` as a string. The console records them as
`failure: { code, message, at }` and compares the complete record across languages.
A failure response with another exit status, missing or additional members, or
malformed values fails comparison.

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
