# @polyspec/crudui-cli

[한국어](README.ko.md).

Private workspace for specification catalogs, static checks and descriptions.
It reads the registries through the `@polyspec/crudui-validator` and `@polyspec/crudui-generator-core`
entries and reads the schema. The CLI runs through `tsx` and requires the built
packages.

Run from the repository root:

```sh
npm ci --strict-allow-scripts
npm run build
node --import tsx packages/cli/bin/crudui.mjs describe --json
npm test --workspace @polyspec/crudui-cli
```

See the [CLI procedure](../../docs/operations/cli.md) for commands, inputs,
outputs and exit codes.
