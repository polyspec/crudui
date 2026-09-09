# Examples

[한국어](examples.ko.md).

Current examples use unversioned public APIs. `examples/cross-check-console`
compares validation and rendering results across implementations. Form usage is
defined in [form operations](../operations/forms.md).

Reusable form inspection and JSON order checks are maintained under
`tests/form-inspector/` and `tests/ordered-json/`.

Examples using the legacy specification or legacy API are stored under
`examples/legacy`. Their code imports explicit legacy entries.
Their dependencies, build contexts and documentation resolve from that directory.
The main example index identifies the current entry points separately from
legacy demonstrations. Relocation does not establish successful verification;
implementation status records checks separately.

PHP example classes use one PSR-4 class per matching source file. Composer
optimized autoload generation must not exclude example classes.

Controlled legacy React forms notify the parent once per field change, outside
React state updater functions. Consecutive changes preserve previous field values.

Frontend examples import repository-local specifications during the example
build. The resulting static build includes its form specifications.

Controlled example parents apply the complete data object returned by the form
change callback, preserving nested objects and repeated collections.

The external comparison environment uses Compose for its image, resources,
mounts and startup health check. `containerctl up` reuses unchanged containers
and serves local HTTPS. Repeated application of the same configuration must
preserve storage, routes and HTTP responses.
