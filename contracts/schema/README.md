# CRUDUI JSON Schema
<!-- doc-id: schema-readme -->

[한국어](README.ko.md).

[`crudui.schema.json`](crudui.schema.json) defines form and list declaration
shapes using JSON Schema draft-07. The root references `Field`; `List` is available
at `#/definitions/List`. The schema is maintained as source.

[`form-template.schema.json`](form-template.schema.json) defines the JSON of a compiled
form template, which `compileForm` writes; `decodeFormTemplate` of
`@polyspec/crudui-generator-core` checks a parsed template against it. See the
[form runtime](../../docs/spec/form-runtime.md).

```bash
make docs-schema
```

The command compiles the schema and verifies shared fixtures without changing
source or expected results. See [schema validation](../../docs/operations/schema-validation.md).

Configure your YAML editor to use this schema for CRUDUI declarations:

```yaml
# yaml-language-server: $schema=../../contracts/schema/crudui.schema.json
type: group
properties:
  email:
    type: email
    validate:
      required: true
      email: true
```

Composition and expression evaluation are separate runtime operations. JSON Schema
checks declaration shapes; the validators check submitted data against those
declarations. See the [schema contract](../../docs/spec/schema.md).
