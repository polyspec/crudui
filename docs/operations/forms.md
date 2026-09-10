# Form development and verification

[한국어](forms.ko.md). The contract is [form runtime](../spec/form-runtime.md).

## Setup

Run commands from the repository root. Install Node.js and npm, then run:

```sh
npm ci --strict-allow-scripts
npm run build
```

Dependency updates resolve the version ranges in package manifests and update
the lock file with npm. Review the resulting graph and run the checks below.
Review install-script changes and use `npm install-scripts approve <package>` to
update the independent graph's root `allowScripts` field with exact versions.
Run `npm rebuild` to execute newly approved scripts in an existing installation.
Container images install `unzip` for Puppeteer's browser archive extraction.

PHP with Composer dependencies, Go and Rust are needed for four-language checks.
Install PHP dependencies with `composer install` in `packages/validator-php`.
No container is required when these toolchains are available locally.

## Build before loading data

```tsx
import {
  compileForm, createForm, Form, sequenceRowKey,
} from '@crudui/generator-react';

const template = compileForm({
  type: 'group',
  properties: {
    stores: {
      type: 'group', multiple: { copy: true, sortable: true },
      properties: { name: { type: 'text', validate: { required: true } } },
    },
  },
}, { keyPrefix: 'form' });
const cached = JSON.stringify(template);
const form = createForm(JSON.parse(cached));

function StoreForm() {
  return <Form form={form} />;
}

form.setData({ stores: { [sequenceRowKey(42)]: { name: 'Store' } } });
const copied = form.copyRow('stores', sequenceRowKey(42));
form.rekeyRow('stores', copied, sequenceRowKey(43));
const submission = form.getData();
```

Keep the template in the shared cache and create an independent form instance for
each rendered form. Call `setData` when a record load finishes. Vue and Svelte
also accept the `form` prop. Framework packages export the same core functions.
Each framework exports `renderForm(form)` for SSR; Vue returns a promise.
Compile `$ref` files before rendering.

Validate `submission` with `Validator` from `@crudui/validator` and the original
spec. The server assigns saved sequences; apply each returned key to its specific
collection path. Never replace a token across the entire data object.

## Checks

```sh
npm run test:forms
npm test -w @crudui/validator -- --run
make docs-check
```

Run the server validation cases from each package directory:

```sh
# packages/validator-php
vendor/bin/phpunit --filter ValidateConformanceTest
# packages/validator-go
go test ./validator/validate -count=1
# packages/validator-rust
cargo test --test validate_conformance
```

`test:forms` builds current packages and runs core, SSR and mounted DOM tests.
The shared DOM scenario covers late data injection, edits, nested row operations,
saved keys, checkboxes, dates, language fields and conditional display. DOM tests
use jsdom; they do not establish external editor or browser file-picker behavior.
Record current results in [features](../features.md) and [changelog](../../CHANGELOG.md).

The Svelte package build emits JavaScript, preprocessed Svelte components and
TypeScript declarations into `dist`. Public export entries reference these
packaged files. Consumers compile components for their browser or SSR target.

Run `npm run test:packages` to build and pack all JavaScript packages, install
them into an isolated consumer project, check exported files and declarations,
and compile a production application using all three form components.

## Package declaration checks

The JavaScript bundler generates runtime modules. The TypeScript compiler
generates declarations from public entries with `noEmitOnError`, independently
of the bundler. Svelte components and declarations use the package compiler.

```sh
npm run test:build
npm run test:build:repeat
npm run test:packages
```

See the [package build contract](../spec/package-build.md) and
[build checks](../../tests/build/README.md) for the verification scope.
