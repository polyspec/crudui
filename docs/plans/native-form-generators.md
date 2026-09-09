# Native form generators

[한국어](native-form-generators.ko.md).

Status: implementation proposal. Required capabilities are defined in
[runtime packages](../spec/runtime-packages.md). This proposal does not establish
completed generation, SSR integration or native PHP verification.

## Source inventory

| Component | Actual operation | Source |
| --- | --- | --- |
| JavaScript core | Compile templates, bind data and manage editable instances | [Core exports](../../packages/generator-core/src/index.ts) |
| React, Vue and Svelte | Browser forms, form SSR and list SSR using the JavaScript core | [React exports](../../packages/generator-react/src/index.ts), [Vue exports](../../packages/generator-vue/src/index.ts), [Svelte exports](../../packages/generator-svelte/src/index.ts) |
| PHP library | Compose, evaluate expressions and validate data | [Validation entry](../../packages/validator-php/src/Validate/Validate.php) |
| Go library | Compose ordered specifications, evaluate expressions and validate data | [Validation entry](../../packages/validator-go/validator/validate/index.go) |
| Rust library | Compose, evaluate expressions and validate data | [Library exports](../../packages/validator-rust/src/lib.rs) |
| Console generation | Execute the three JavaScript framework renderers | [Render runner](../../examples/cross-check-console/server/render-runner.mjs) |
| Console validation | Execute four language validators through their CLIs | [Validation runner](../../examples/cross-check-console/server/validate-runner.mjs) |

The PHP, Go and Rust validator packages do not provide form compilation or HTML
rendering. The external comparison's native PHP target loads a native JSON parser
and uses the PHP validator. Its report is transport and browser evidence, not
evidence of a native CRUDUI generator or validator.

The shared rendering fixtures contain 92 form cases and 21 list cases. Their
current consumers are JavaScript framework renderers. They are normalized layout
checks. The raw HTML inspector and browser initialization scenarios provide
separate checks and must remain available.

## Package map

| Package | Implementation responsibility | Reuse |
| --- | --- | --- |
| `packages/generator-core` | JavaScript templates, instances and evaluated models | JavaScript composition and expression modules |
| `packages/generator-react`, `generator-vue`, `generator-svelte` | Framework integration, browser operation and rendering | Shared JavaScript generator |
| `packages/generator-php` | PHP template compilation, data binding, form and list HTML | PHP composition and expression modules |
| `packages/generator-go` | Go template compilation, data binding, form and list HTML | Go composition and expression modules |
| `packages/generator-rust` | Rust template compilation, data binding, form and list HTML | Rust composition and expression modules |
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
| Validate | `validate` | `Validator::validate` | `Validate` | `validate` | `Validator::validate` |

Both PHP implementations use the classes `CRUDUI\Generator`,
`CRUDUI\Validator` and `CRUDUI\Form`. The
[PHP API contract](../spec/php-extension.md) defines the common methods and
loading order. The extension registers these classes when enabled. Without the
extension, Composer autoloads the PHP classes. Examples use the same calls in
both configurations; comparison tests use separate PHP processes and verify
class provenance and method signatures.

The PHP package implementation moves `CRUDUI\Validator\Validate\Validate::run`
to `CRUDUI\Validator::validate` and `ListValidate::run` to
`CRUDUI\Validator::validateList`. Update Composer class mappings, package tests,
CLI adapters, examples and generated API documentation together. Remove the
replaced public entry points; retain the internal composition, expression and
rule modules needed by generation and validation. Public classes use class
autoloading, not eagerly included function files or aliases.

## PHP extension implementation choice

Two implementations satisfy native execution:

| Choice | Benefit | Required work and dependency |
| --- | --- | --- |
| C implementation of generation and validation | Direct PHP/Zend development and a C build | Implement and maintain composition, expressions, generation and validation in C; verify this additional engine against the common cases |
| Rust implementation with PHP bindings | Reuse both the standalone Rust generator and validator in the PHP process | Rust build tools, PHP headers and Zend bindings; verify PHP values, exceptions, object lifetime and supported PHP versions |

The proposed choice is Rust reuse after the standalone Rust generator passes
its checks. This reuses both required Rust SSR and validation capabilities.
It does not assign generation exclusively to Rust: PHP and Go still have their
own generator packages. A requirement for an entirely C implementation changes
this choice and adds a C engine; it must not be described as a binding-only change.
The extension implementation choice is unresolved. Native binding work begins
after this choice is resolved.

## Data review before porting

- Preserve compiled field order and record member order. Go compilation already
  has an ordered specification object, while validation data uses an unordered
  map. Generator data must use an ordered representation throughout.
- Distinguish absent values, `null`, `{}` and `[]`; test conversions at each
  language entry. Do not create rows or hidden values to make validation succeed.
- Share the existing expression parser and evaluator within each language.
  Do not implement a second expression recognizer with unrelated heuristics.
- Separate the immutable template, editable instance, field model and HTML
  serializer. Keep rendering free of persistence and validation side effects.
- Resolve every control identifier once and use it consistently in labels,
  scripts, native HTML and browser updates. Validate selector behavior where a
  field emits a script.
- Review date formatting, string conversion, option order, escaping, raw content
  and list formatting explicitly. Language defaults are not conformance evidence.

## Implementation sequence

1. Add shared template, bound-model and keyed instance fixtures from reviewed
   contracts. Include positive expectations and rejected operations. Keep raw HTML
   and normalized layout evidence separate.
2. Run the fixtures against the JavaScript implementation. Reproduce and fix any
   contract failures before accepting its output as a reference. Comparison code
   must reject missing targets, malformed results and failed processes.
3. Implement PHP, Go and Rust generation in separate modules using their existing
   composition and expression APIs. Verify templates and models across runtimes,
   then verify HTML and public package builds. Commit each verified implementation
   by its actual purpose.
4. Implement both native PHP operations using the selected extension architecture.
   Test extension loading with and without Composer, PHP execution with the
   extension disabled, matching public signatures, conversion, exceptions,
   lifetime, repeated requests and the same generation and validation cases.
5. Add current examples for every server implementation. A server generates its
   own HTML and templates, validates form and ordered JSON input, persists valid
   records and reloads them. Browser assets may be built with Node; server-side
   generation must execute in the selected server implementation.
6. Verify PHP, PHP native, Go and Rust with React, Vue and Svelte. Test SSR with
   data, cached templates with initial data, and static forms with later data.
   Include both transports, nested copying, saved keys, empty collections,
   ordering, labels, multiple selection, visibility, focus and scrolling.
7. Add clean package builds and all native checks to CI. Update English and Korean
   specifications, operations, feature state, package examples and changelog from
   actual results. Preserve current source and comparison evidence until replacement
   behavior is verified.

## Completion requirements

- All five execution targets provide generation and validation through their
  documented package entry points.
- Cached templates work across runtimes. Initial data, injection and restoration
  pass raw HTML, DOM, CSS, control-state and submission comparisons.
- Browser reports identify the server implementation that actually generated and
  validated the form. The four-by-three HTTP matrix is complete.
- CI invokes every new package's checks. A passing existing CI job does not
  establish a result for a package that the job did not build or test.
- Package publication is recorded independently of builds and local examples.
