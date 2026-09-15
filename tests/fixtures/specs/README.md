# Benchmark specifications

[한국어](README.ko.md).

This family contains a production-sized form declaration rather than shared cases. The files use
the field model of the `legacy` modules, described in the
[`legacy` schema](../../../docs/spec/legacy-schema.md).

- [`ProductNft.yml`](ProductNft.yml) is a large product form with nested groups, repeated fields,
  conditional expressions, visibility targets and a `$ref`.
- [`OptionMultiplexable.yml`](OptionMultiplexable.yml) is a repeated option group kept in a separate
  file because it is also used for composition.
- [`ProductNft.analysis.md`](ProductNft.analysis.md) counts the field types, validation rules,
  conditional expressions, visibility patterns, switch classes and references of both files, and
  lists their structure and testing considerations.

## Comparisons

No test compares results against these files. The
[validation benchmark](../../../packages/validator-ts/benchmarks/validation.bench.ts), run by
`npm run bench` in `packages/validator-ts`, loads `ProductNft.yml` into the `legacy` validator and
measures instantiation and validation with generated valid, invalid and minimal data. When the file
cannot be loaded, the benchmark uses a smaller built-in specification. No code loads
`OptionMultiplexable.yml` or `ProductNft.analysis.md`.

## Regeneration

There is no generator; the files are written by hand. Update `ProductNft.analysis.md` when either
declaration changes, and keep the field names of the benchmark data consistent with
`ProductNft.yml`.
