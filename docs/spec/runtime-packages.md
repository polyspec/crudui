# Runtime packages

[한국어](runtime-packages.ko.md).
Implementation and verification are recorded in [feature status](../features.md).

## Required capabilities

JavaScript, PHP, Go and Rust provide specification composition, form structure
compilation, data binding, HTML rendering and validation. PHP native execution
provides both form generation and validation. A server language can render forms
without starting a JavaScript server or invoking another language's executable.

| Runtime | Composition and expressions | Form compilation and binding | Form HTML and list rendering | Validation |
| --- | --- | --- | --- | --- |
| JavaScript | required | required | required | required |
| PHP | required | required | required | required |
| Go | required | required | required | required |
| Rust | required | required | required | required |
| PHP native extension | required | required | required | required |

The table defines requirements, not completed implementation. The PHP extension
may share compiled libraries, but both operations execute inside the PHP process.
PHP packages and the extension implement the same public classes. An enabled
extension registers those classes before application execution; otherwise,
Composer autoloads the PHP implementation. The [PHP API contract](php-extension.md)
defines loading and method equality. Comparison tests run PHP and native PHP in
separate processes and verify which implementation actually executed. An
unavailable native module fails the native test target.

## Shared contracts and separate responsibilities

All runtimes implement the same [schema](schema.md), [expressions](expressions.md),
[validation rules](validation-rules.md) and [form runtime](form-runtime.md).
Within each runtime, generation and validation reuse composition and expression
evaluation. Rendering does not redefine requiredness or validation rules.

1. Compilation resolves references and prepares the complete form structure
   without record data. The output can be serialized and cached.
2. An instance owns record values, defaults, row identities and row operations.
   Instances do not modify shared templates.
3. Binding evaluates field values, localization and design against instance data.
4. Rendering creates HTML from evaluated fields. Validation receives submitted
   record data and reports validation or specification errors.
5. Browser binding applies user input and row actions. Server runtimes do not
   implement browser focus, selection or scroll behavior.

Server rendering and static delivery are supported application configurations.
Applications can render with data on the server or load a cached structure in the
browser and inject data later. Neither configuration changes the schema, record
structure or validation rules.

## Data and interoperability

Compiled templates share one JSON contract across runtimes. A template compiled
by one runtime can be bound by another without modification. Template field order
and keyed record order are preserved. An unordered host-language map cannot be
used to infer a lost declaration or row order.

The [ordered JSON procedure](../operations/ordered-json.md) defines transport
verification. Ordered JSON object members become ordered runtime objects;
arrays remain arrays. Absent values, `null`, empty objects and empty arrays remain
distinct. Runtime conversion does not introduce identity or ordering fields.

Repeated row keys identify rows within their parent collection. Saved sequences,
new keys, ordering and scoped row operations follow the form runtime contract in
every implementation. Invalid operations leave both data and evaluated fields
unchanged.

## Verification

Generation and validation have separate checks for every runtime. Successful
validation does not establish generation or SSR support. A comparison records
the implementation that actually compiled, bound, rendered and validated each
request.

Cross-runtime checks compare complete compiled templates, bound field models,
record data and validation results. HTML checks compare field names, identifiers,
attributes, text, classes, CSS, visibility and control state. Differences are
retained and reported; removing identifiers, values or hidden fields from a
comparison cannot establish equality.

For the same template, record, language and supplied row keys, initial data and
later injection must produce identical HTML and submitted data. Repeated injection
and record restoration must preserve that equality. Browser checks verify these
paths in React, Vue and Svelte, including edits, labels, multiple selections, row
actions, focus, selection and scrolling. SSR integration requires its own checks;
client rendering with a non-JavaScript validation server does not verify SSR.

HTTP examples cover PHP, PHP native, Go and Rust independently with all three
browser frameworks: four server targets by three frameworks. Each target tests
form and ordered JSON submission, validation, persistence and reload. Core
JavaScript generation and validation remain part of the shared conformance suite.
An omitted runtime, process failure, malformed response or missing expectation
fails the comparison.
