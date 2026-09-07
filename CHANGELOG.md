# Changes

[한국어](CHANGELOG.ko.md).

## 2026-09-07 — Schema generation

Removed the unnecessary `ignoreDeprecations: "6.0"` compiler setting because the
schema generator's bundled TypeScript compiler rejects it. TypeScript type
checking, schema generation with three example checks, and the documentation
site build passed. Deployment: not deployed.
