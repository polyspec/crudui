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
`Validator::validateDetail` checks detail specification composition, including
`$ref` and `$patch` on the root and the `fields` map, and metadata; it does not
validate a record. Both return `{ valid: true, errors: [] }` on a clean load.
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
Only `spec` is required. An absent `mode` means `form`, which validates `data`.
`list` runs `validateList` and `detail` runs `validateDetail`; both ignore
`data`. Absent or `null` `files` and `basepath` mean none.

Before validation the CLI checks the request in this order. The first failure
writes exactly `{ "error": MESSAGE }` and exits with code one:

1. stdin is not valid JSON: `Request must be valid JSON`.
2. The request is not a JSON object: `Request must be an object`.
3. `spec` is absent or not an object: `Request spec must be an object`.
4. `mode` is present and not exactly `form`, `list` or `detail`, including
   `null` and non-string values: `Unsupported validation mode`.
5. `files` is present, not `null` and not an object: `Request files must be an object`.
6. A `files` member is not an object: `Request files must contain objects`.
7. `basepath` is present, not `null` and not a string: `Request basepath must be a string`.

Successful execution writes `{ "valid": true, "errors": [] }` or data errors
with exit code zero. An omitted `data` member validates `{}`; a supplied value
must be a JSON object. A load or input failure writes exactly
`{ "error", "code", "at" }` and exits with code two. A malformed request writes
`{ "error" }` and exits with code one. Every language's CLI uses this contract.

`composer test:current` runs composition, expression, current validation and
field-model tests. `composer test` also runs the retained legacy rule suite and
public symbol documentation checks. [Feature status](../../docs/features.md)
records current verification separately from publication.
