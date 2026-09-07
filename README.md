# Polyspec

[한국어](README.ko.md).

Polyspec defines forms and validation in YAML or JavaScript objects. A shared
core compiles form structure before data is available. React, Vue and Svelte
render editable instances; TypeScript, PHP, Go and Rust validate submitted data.

## Start

Run from the repository root:

```sh
npm ci
npm run build
npm run test:forms
```

See [form setup and usage](docs/operations/forms.md) for compiling, caching,
mounting and injecting data.

## Documentation

- [Specification structure](docs/spec/schema.md)
- [Form runtime contract](docs/spec/form-runtime.md)
- [Feature and deployment status](docs/features.md)
- [Development and verification](docs/operations/forms.md)
- [Browser comparison and PHP persistence](docs/operations/form-comparison.md)
- [Documentation maintenance](docs/operations/documentation.md)
- [Changes](CHANGELOG.md)
- [Development rules](AGENTS.md)

Run `make docs-check` to check documentation and `make docs` to generate API
references, schema and the documentation site. Test success and deployment status
are recorded separately.
