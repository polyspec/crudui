# CRUDUI

[한국어](README.ko.md).

CRUDUI defines forms and validation in YAML or JavaScript objects. A shared
core compiles form structure before data is available. React, Vue and Svelte
render editable instances. The framework-independent HTML renderer provides
form and list HTML without a UI framework. PHP, Go and Rust provide form and list rendering and
validation in their own processes. A PHP extension provides the same public PHP
classes using native generation and validation.

## Start

Run from the repository root:

```sh
npm ci --strict-allow-scripts
npm run build
npm run test:forms
```

See [form setup and usage](docs/operations/forms.md) for compiling, caching,
mounting and injecting data.

## Documentation

[Online documentation](https://polyspec.github.io/crudui/) provides the English
and Korean guides, specifications and generated API references.

- [Specification structure](docs/spec/schema.md)
- [Display formats](docs/spec/display-formats.md)
- [Form runtime contract](docs/spec/form-runtime.md)
- [Runtime packages and APIs](docs/spec/runtime-packages.md)
- [Native PHP package](packages/php-ext/README.md)
- [Feature and deployment status](docs/features.md)
- [Development and verification](docs/operations/forms.md)
- [Form and transport verification](docs/operations/verification.md)
- [Documentation maintenance](docs/operations/documentation.md)
- [Changes](CHANGELOG.md)
- [Development rules](AGENTS.md)

Run `make docs-check` to check documentation and `make docs` to generate API
references, schema and the documentation site. Test success and deployment status
are recorded separately.
