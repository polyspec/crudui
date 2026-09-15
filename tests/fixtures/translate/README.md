# Translation fixtures

[한국어](README.ko.md).

`cases.json` contains the translation cases from the field model of the `legacy` modules, described
in the [`legacy` schema](../../../docs/spec/legacy-schema.md), into the
[specification structure](../../../docs/spec/schema.md). Translation runs in TypeScript only; the
translated specifications are what the other runtimes validate and render. Each case provides
`name`, `note`, `legacy`, `schema`, `notes` and `roundtrip`. Every entry of `notes` has `path`,
`legacyKey`, `reason` and `detail`. `roundtrip` has `reversible`; a reversible case also records
`lossless` and the translated-back declaration `back`.

These cases check visibility targets and switches, design nodes, validation rules, conditional
requiredness, behavior, language and repetition settings, composition patches, type-dependent
options, `x`-prefixed comment keys, static and source-backed items, form buttons and actions,
reserved field names, and removal of empty or null values.

## Comparisons

The [TypeScript conformance test](../../../packages/validator-ts/src/legacy/translate/translate.conformance.test.ts)
translates `legacy` again and requires a deeply equal `schema` and a strictly equal `notes` list.
Each `schema` must pass the [meta-schema](../../../schema/crudui.schema.json) and contain no
forbidden or `x`-prefixed key at any depth. A reversible case must produce no notes, and
translating its specification back must equal both `legacy` and `roundtrip.back`. An irreversible
case must produce at least one note with `reason`, `path` and `legacyKey`, and must not record
`lossless`.

[`check-schema.mjs`](../../../scripts/check-schema.mjs), run by `npm run spec:schema`, also requires
every `schema` to pass the form meta-schema.

## Regeneration

Run from the repository root:

```sh
node_modules/.bin/tsx tests/fixtures/translate/generate.ts > tests/fixtures/translate/cases.json
```

The generator runs the translator and records its output, notes and round-trip result. It stops
when a translated specification contains a forbidden key or a reversible case does not translate
back unchanged. Review changes against both schemas before accepting them. Regeneration alone is
not verification.
