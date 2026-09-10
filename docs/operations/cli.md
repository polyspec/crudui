# Specification CLI

[한국어](cli.ko.md).

The private `@crudui/cli` workspace provides `describe`, `list-widgets`, `check`
and `explain`. Install dependencies and build the validator from the repository
root before running commands or tests:

```sh
npm ci --strict-allow-scripts
npm run build:validator
```

The CLI runs through `tsx`; its imported generator modules require the built
validator package. Rebuild the validator after changing its source. CI uses the
same installation, build and test order.

Run commands from the repository root:

```sh
node --import tsx packages/cli/bin/crudui.mjs describe --json
node --import tsx packages/cli/bin/crudui.mjs list-widgets --json
node --import tsx packages/cli/bin/crudui.mjs check packages/cli/test/fixtures/valid-leaf-type.yml
node --import tsx packages/cli/bin/crudui.mjs explain packages/cli/test/fixtures/valid-leaf-type.yml --lang en
```

| Command | Input and output |
| --- | --- |
| `describe` | Generates a capability catalog from source registries, the schema and the expression contract. JSON is the default; `--md` selects Markdown. |
| `list-widgets` | Returns widget names, layouts and aliases. `--json` selects a JSON array. |
| `check <path>` | Parses JSON or YAML, checks the schema and forbidden keys, composes fields and checks leaf widget types. Returns `{ ok, errors }`. |
| `explain <path>` | Describes a JSON or YAML specification. `--lang en` selects English; the default is Korean. It does not validate input data. |

`check` errors contain `path`, `reason` and an optional `key`. An unresolved
composition is an error; checking the original uncomposed input is not a substitute.
The command has no external reference file-set option. Use the
[validation API](validation.md) with an explicit loader or file set when external
composition inputs are needed.

Successful commands exit with zero. A failed `check` or execution error exits
with 1; an unknown subcommand exits with 2. `validate`, `render` and `scaffold`
are not registered CLI commands. Rendering uses the [form APIs](forms.md).

The catalog contains `meta`, `widgets`, `layouts`, `rules`, `slots`, `buckets`,
`forbiddenKeys`, `grammar`, `classification`, `matrix` and `list`. Its complete
shape is defined by [DescribeResult](../../packages/cli/src/describe.ts).
Do not maintain a separate copied widget or rule catalog.

Run `npm test --workspace @crudui/cli` to check catalog consistency, static
checking and descriptions. Implementation and deployment results belong in
[feature status](../features.md).
