# Runtime packages

[한국어](runtime-packages.ko.md).
Implementation and verification are recorded in [feature status](../features.md).

## Required capabilities

JavaScript, PHP, Go and Rust provide specification composition, form structure
compilation, data binding, HTML rendering and validation. PHP native execution
provides both form generation and validation. A server language can render forms
without starting a JavaScript server or invoking another language's executable.

| Runtime | Composition and expressions | Form compilation and binding | Form HTML, list and detail rendering | Validation |
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

## Package map

| Package | Implementation responsibility | Reuse |
| --- | --- | --- |
| `packages/generator-core` | JavaScript templates, instances and evaluated models | JavaScript composition and expression modules |
| `packages/generator-react`, `generator-vue`, `generator-svelte` | Framework integration, browser operation and rendering | Shared JavaScript generator |
| `packages/generator-html` | Framework-independent JavaScript form, list and detail HTML rendering | Shared JavaScript generator |
| `packages/generator-php` | PHP template compilation, data binding, form, list and detail HTML | PHP composition and expression modules |
| `packages/generator-go` | Go template compilation, data binding, form, list and detail HTML | Go composition and expression modules |
| `packages/generator-rust` | Rust template compilation, data binding, form, list and detail HTML | Rust composition and expression modules |
| `packages/php-ext` | PHP native generation and validation | The same public classes as the PHP packages; generation and validation execute in native code |
| `packages/validator-*` | Data and specification validation | Existing language rule implementations and shared cases |

Each server generator is a library that can run in its own language's HTTP
process. CLI adapters are test and example entry points; they are not the library
implementation. Go rendering does not depend on Rust, PHP or Node at runtime.
PHP rendering does not require its native extension. Rust rendering does not
require the PHP host.

## API operations

Names use each language's naming convention. The operations and results remain
the same; no runtime selector is embedded in a field specification.

| Operation | JavaScript | PHP library | Go | Rust | PHP native |
| --- | --- | --- | --- | --- | --- |
| Compile structure | `compileForm` | `Generator::compileForm` | `CompileForm` | `compile_form` | `Generator::compileForm` |
| Bind data | `bindForm` | `Generator::bindForm` | `BindForm` | `bind_form` | `Generator::bindForm` |
| Create instance | `createForm` | `new Form` | `NewForm` | `Form::new` | `new Form` |
| Replace data | `setData` | `$form->setData` | `SetData` | `set_data` | `$form->setData` |
| Read data | `getData` | `$form->getData` | `GetData` | `get_data` | `$form->getData` |
| Render form | `renderForm` | `Generator::renderForm` | `RenderForm` | `render_form` | `Generator::renderForm` |
| Render list | `renderList` | `Generator::renderList` | `RenderList` | `render_list` | `Generator::renderList` |
| Build detail | `buildDetail` | — | `BuildDetail` | — | — |
| Render detail | `renderDetail` | — | `RenderDetail` | — | — |
| Validate | `validate` | `Validator::validate` | `Validate` | `validate` | `Validator::validate` |

An em dash marks an operation a runtime does not implement. Detail views exist in
JavaScript and Go only, and no check compares their output: the shared fixtures, the
renderer conformance tests and the native byte-equality run cover forms and lists, not
details. The feature is recorded as in progress, and this table states what exists rather
than what the finished feature will contain.

Both PHP implementations use the classes `CRUDUI\Generator`,
`CRUDUI\Validator` and `CRUDUI\Form`. The
[PHP API contract](php-extension.md) defines the common methods and
loading order. The extension registers these classes when enabled. Without the
extension, Composer autoloads the PHP classes. Examples use the same calls in
both configurations; comparison tests use separate PHP processes and verify
class provenance and method signatures.

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
paths in React, Vue, Svelte and the HTML renderer, including edits, labels, multiple
selections, row actions, focus, selection and scrolling. SSR integration requires its
own checks; client rendering with a non-JavaScript validation server does not verify SSR.

HTTP examples cover PHP, PHP native, Go and Rust independently with all four browser
renderers: four server targets by React, Vue, Svelte and the HTML renderer. Each target tests
form and ordered JSON submission, validation, persistence and reload. Core
JavaScript generation and validation remain part of the shared conformance suite.
An omitted runtime, process failure, malformed response or missing expectation
fails the comparison.
