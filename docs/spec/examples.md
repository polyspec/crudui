# Examples

[한국어](examples.ko.md).

Current examples use unversioned public APIs. `examples/form-comparison` verifies
form rendering, data injection and HTTP persistence. `examples/cross-check-console`
compares validation and rendering results across implementations.

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
