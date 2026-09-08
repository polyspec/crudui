# Data validation

[한국어](validation.ko.md).

Validate data with the same specification on the client and server. Fields use
`validate` for rules. Validate the specification's declaration shape separately
with the [schema procedure](schema-validation.md). The
[schema contract](../spec/schema.md) defines composition and accepted fields.

Install dependencies and build the JavaScript packages first. JavaScript and PHP
examples run from the repository root; Go and Rust use the module setup described
below. Each example supplies an empty required email and expects `valid` to be false.

## TypeScript and JavaScript

The package root exports `validate(spec, data, options?)`. Options accept `files`,
`loader` and `basepath` for composition. A supplied loader takes precedence over
the in-memory file set.

```js
import { validate } from '@crudui/validator';

const spec = {
  type: 'group',
  properties: { email: { type: 'email', validate: { required: true, email: true } } },
};
const result = validate(spec, { email: '' });
if (result.valid || result.errors[0]?.rule !== 'required') {
  throw new Error('Expected required validation failure');
}
```

## PHP

`CRUDUI\Validator\Validate\Validate::run` accepts the specification, data,
optional virtual files, an optional loader and a base path. Its result exposes
`valid`, `errors` and `toArray()`.

```php
<?php
require 'packages/validator-php/vendor/autoload.php';

use CRUDUI\Validator\Validate\Validate;

$spec = [
    'type' => 'group',
    'properties' => [
        'email' => ['type' => 'email', 'validate' => ['required' => true, 'email' => true]],
    ],
];
$result = Validate::run($spec, ['email' => '']);
if ($result->valid || $result->errors[0]['rule'] !== 'required') {
    throw new RuntimeException('Expected required validation failure');
}
```

## Go

The `validator/validate` package provides `Validate` for an ordered specification value
and `ValidateJSON` for JSON bytes. `ValidateJSON` accepts specification bytes,
data bytes, virtual-file bytes and a base path. Run the example in the
`packages/validator-go` module. Its result exposes `Valid` and `Errors`.

```go
package main

import (
    "fmt"
    "github.com/crudui/crudui/packages/validator-go/validator/validate"
)

func main() {
    spec := []byte(`{"type":"group","properties":{"email":{"type":"email","validate":{"required":true,"email":true}}}}`)
    result, err := validate.ValidateJSON(spec, []byte(`{"email":""}`), nil, "")
    if err != nil {
        panic(err)
    }
    if result.Valid || len(result.Errors) == 0 || result.Errors[0].Rule != "required" {
        panic(fmt.Errorf("expected required validation failure"))
    }
}
```

## Rust

The crate root exports `validate` and `ValidateOptions`. Options accept virtual
files, a loader and a base path. Run the example with the `crudui-validator`
crate and `serde_json` dependencies.

```rust
use crudui_validator::{validate, ValidateOptions};
use serde_json::json;

fn main() {
    let spec = json!({
        "type": "group",
        "properties": {"email": {"type": "email", "validate": {"required": true, "email": true}}}
    });
    let result = validate(&spec, &json!({"email": ""}), &ValidateOptions::default())
        .expect("specification should load");
    assert!(!result.valid);
    assert_eq!(result.errors[0].rule, "required");
}
```

## Results and failures

A validation result contains a boolean and a flat error list. Each error identifies
`path`, `field`, `rule` and `message`, with `value` when available. A required-input
failure is a validation result. A missing composition reference or a forbidden
schema key is a load failure: JavaScript and PHP throw; Go returns an error; Rust
returns `Err`. Do not convert a load failure into successful validation.

Visibility does not disable validation. `design.show: false` hides a field but
does not change its required rule. Conditional requirements use an expression in
`validate.required`; see the [expression contract](../spec/expressions.md).

Data validation does not implement HTTP decoding, persistence or transport order.
Follow the [ordered JSON procedure](ordered-json.md) and
[transport verification procedure](verification.md) for those operations.
Complete symbol references are generated with `make docs-api`; see the
[documentation procedure](documentation.md).
