# CRUDUI PHP validator

[한국어](README.ko.md).

Compose specifications, evaluate expressions and validate data in PHP.

```sh
composer install --working-dir=packages/validator-php
composer test --working-dir=packages/validator-php
composer test:current --working-dir=packages/validator-php
```

## Public API

```php
require 'packages/validator-php/vendor/autoload.php';

use CRUDUI\Validator;

$spec = json_decode('{"type":"group","properties":{"name":{"type":"text","validate":{"required":true}}}}');
$result = Validator::validate($spec, ['name' => 'Ada']);
assert($result->valid);
```

`Validator::validate($spec, $data, $options)` composes the specification, scans
for unsupported metadata and validates submitted data. `Validator::validateList`
checks list specification composition and metadata; it does not validate rows.
Options accept a `files` object and `basepath`. Composition failures raise
`CRUDUI\Validator\Compose\ComposeLoadError`. Submitted data with the wrong shape
raises `CRUDUI\Validator\Validate\FormInputError` with code `INVALID_FORM_INPUT`.
`getCompositionTrace()` returns the specification paths; `getTrace()` returns
the exception stack.

Results and error entries are `stdClass` objects. `errors` is an array of
`path`, `field`, `rule`, `message` and `value` records. Associative PHP arrays and
`stdClass` represent objects; sequential PHP arrays represent arrays. Empty
objects require `new stdClass()`. Nested objects, arrays and `null` remain
distinct, including error values. Invalid UTF-8 strings and object keys raise
`InvalidArgumentException` before validation.

The public class is `CRUDUI\Validator`. If the native extension registers the
class, PHP uses that implementation; otherwise Composer autoloads the PHP class.
The [PHP API contract](../../docs/spec/php-extension.md) defines method equality
and loading behavior. Internal composition and expression modules are shared
with the [PHP generator](../generator-php/README.md).

## Validation CLI

```sh
php packages/validator-php/bin/validate.php < request.json
```

The CLI reads `{ "spec": {}, "data": {}, "files": {}, "basepath": "", "mode": "form" }`.
Only `spec` is required. `mode` is `form` or `list`; the default is `form`.
Successful execution writes `{ "valid": true, "errors": [] }` or data errors
with exit code zero. An omitted `data` member validates `{}`; a supplied value
must be a JSON object. A load or input failure writes exactly
`{ "error", "code", "at" }` and exits with code two. A malformed request writes
`{ "error" }` and exits with code one. Every language's CLI uses this contract.

`composer test:current` runs composition, expression, current validation and
field-model tests. `composer test` also runs the retained legacy rule suite and
public symbol documentation checks. [Feature status](../../docs/features.md)
records current verification separately from publication.
