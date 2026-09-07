# Form development and verification

[한국어](forms.ko.md). The contract is [form runtime](../spec/form-runtime.md).

## Setup

Run commands from the repository root. Install Node.js and npm, then run:

```sh
npm ci
npm run build
```

PHP with Composer dependencies, Go and Rust are needed for four-language checks.
Install PHP dependencies with `composer install` in `packages/validator-php`.
No container is required when these toolchains are available locally.

## Build before loading data

```tsx
import {
  compileForm, createFormSession, FormSessionView, sequenceRowKey,
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
const session = createFormSession(JSON.parse(cached));

function StoreForm() {
  return <FormSessionView session={session} />;
}

session.setData({ stores: { [sequenceRowKey(42)]: { name: 'Store' } } });
const copied = session.copyRow('stores', sequenceRowKey(42));
session.rekeyRow('stores', copied, sequenceRowKey(43));
const submission = session.getData();
```

Keep the template in the shared cache and create one session per form instance.
Call `setData` when a record load finishes. Render `FormSessionView` with the
`session` prop in Vue and Svelte as well. Framework packages export the same core
functions. SSR entry points accept a compiled template and `{ data, language }`:
Repository SSR helpers are `renderForm` in `src/index.ts` for React and
Svelte, and `renderFormSSR` in `src/ssr.ts` for Vue. These source helpers are
not package subpath exports. Compile `$ref` files before rendering.

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
