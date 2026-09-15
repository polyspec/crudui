# CRUDUI PHP generator

[한국어](README.ko.md).

Compile reusable form structures, bind record data, edit keyed rows and render
forms, lists or read-only details in PHP. Rendering and validation run in the PHP process.

## Install and verify

From the repository root:

```sh
composer install --working-dir=packages/generator-php
composer test --working-dir=packages/generator-php
```

The Composer path repository copies `crudui/validator` from the adjacent
package into `vendor/`. 64-bit PHP 8.2 or newer and `mbstring` are required.
Development tests also require the extensions used by PHPUnit, including DOM.

## Form API

```php
require 'packages/generator-php/vendor/autoload.php';

use CRUDUI\Form;
use CRUDUI\Generator;

$spec = json_decode('{"type":"group","properties":{"name":{"type":"text","label":"Name"}}}');
$template = Generator::compileForm($spec, ['keyPrefix' => 'form']);
$cache = json_encode($template, JSON_THROW_ON_ERROR);

$initial = new Form($template, ['name' => 'Ada']);
$injected = new Form(json_decode($cache, false, 512, JSON_THROW_ON_ERROR));
$injected->setData(['name' => 'Ada']);
assert(Generator::renderForm($initial) === Generator::renderForm($injected));
echo Generator::renderForm($initial);
```

Compilation accepts `files`, `basepath` and `keyPrefix`. Binding and instances
accept `language`, `idPrefix`, `keyPrefix` and `unsupported`. Use distinct
`idPrefix` values when multiple forms appear in one document.

`Generator::bindForm($template, $data, $options)` returns evaluated field models.
`Generator::renderForm($form)` returns HTML without an HTML `form` element.
`Generator::renderList($spec, $rows, $options)` renders supplied rows in the `table`
or `card` layout selected by `options.layout`.
`Generator::renderDetail($spec, $record, $options)` renders one supplied record as a
read-only detail, and `Generator::buildDetail($spec, $record, $options)` returns the
markup-free detail model the renderer uses. Neither rendering method reads application
data. The host provides submission handling, styles and browser integrations declared by
fields.

Date and datetime controls and list date formatting use UTC. Explicit offsets
are converted before display; timestamps without offsets are interpreted in UTC.
Invalid or unsupported date strings and the original instance data remain unchanged.

`Form` provides `getTemplate`, `getFields`, `getRevision`, `getData`, `getValue`,
`setData`, `setValue`, `addRow`, `copyRow`, `removeRow`, `moveRow` and `rekeyRow`.
Returned values are detached copies. Invalid operations leave data, fields and
revision unchanged.

```php
$companySpec = json_decode('{"type":"group","properties":{"companies":{"type":"group","multiple":true,"properties":{"name":{"type":"text"}}}}}');
$form = new Form(Generator::compileForm($companySpec), ['companies' => new stdClass()]);
$key = Generator::sequenceRowKey(42);
$form->addRow('companies', ['key' => $key, 'value' => ['name' => 'Example']]);
$form->copyRow('companies', $key, ['key' => 'new-company']);
$form->moveRow('companies', 'new-company', 0);
$form->rekeyRow('companies', 'new-company', Generator::sequenceRowKey(43));
```

Repeated data is an object keyed by row identity. Missing repeated data creates
one row; an explicit empty `stdClass` creates zero rows. Sequential PHP arrays
are JSON arrays. Associative PHP arrays and `stdClass` are objects. Returned
records and templates are `stdClass`; lists are arrays. Nested empty arrays,
empty objects and `null` remain distinct. Numeric row keys are rejected; use
`sequenceRowKey` to format database sequences.

At a JSON boundary, decode with `json_decode($json, false, 512, JSON_THROW_ON_ERROR)`.
The `true` associative mode loses the distinction between an empty object and an
array, and can also make an object with sequential numeric keys appear to be a
list. Use `new stdClass()` for an explicit empty object. An associative array is
accepted for an object argument, and an empty array for an empty root object argument,
whose type is fixed by its API.

Composition failures raise `CRUDUI\Validator\Compose\ComposeLoadError`.
Its `getCompositionTrace()` returns specification paths separately from the
exception stack returned by `getTrace()`.
Generation failures raise `CRUDUI\FormError`; `getErrorCode()` and `getPath()`
return the error code and field path. Unsupported fields use
`UNSUPPORTED_FIELD_TYPE`; other invalid generation input uses `INVALID_FORM_INPUT`.
Invalid public argument types raise `TypeError`.
Invalid UTF-8 strings and object keys are rejected before form state changes.

## PHP example

```sh
CRUDUI_DATA_FILE=/tmp/crudui-php-example.json php -S 127.0.0.1:8082 -t packages/generator-php/examples
```

Open `http://127.0.0.1:8082`. The example renders the form in PHP, accepts a
native form submission, validates the data, stores valid records as JSON at the
explicit path and reloads the saved record. It does not provide browser row
editing or an ordered JSON HTTP endpoint.

## Test adapter

`php packages/generator-php/bin/generate.php` reads one JSON request from stdin
and writes one JSON value to stdout. Supported operations are `compileForm`,
`bindForm`, `renderList`, `buildDetail`, `renderDetail` and `form`. The form operation records data, fields,
HTML and revision after each action, including failed operations. The adapter
uses the public classes and can execute with the PHP implementation or a loaded
native implementation.

The [native conformance suite](../../tests/native-generators/README.md) compares
complete templates and models, original form and list HTML, injection, row
operations and retained state after failures across runtimes.

The [form contract](../../docs/spec/form-runtime.md),
[PHP API contract](../../docs/spec/php-extension.md) and
[runtime requirements](../../docs/spec/runtime-packages.md) define shared
behavior. [Feature status](../../docs/features.md) records verification and
publication separately.
