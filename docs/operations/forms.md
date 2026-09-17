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
import { compileForm, createForm, sequenceRowKey } from '@crudui/generator-core';
import { Form } from '@crudui/generator-react';

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

For framework-independent HTML, use the peer renderer package:

```ts
import { connectForm, patchContent } from '@crudui/generator-core';
import { renderForm, renderList } from '@crudui/generator-html';

patchContent(host, renderForm(form));
const connection = connectForm(host, form);
form.subscribe(() => {
  patchContent(host, renderForm(form));
  connection.sync();
});
const listHtml = renderList(listSpec, rows, { layout: 'table' });
```

`patchContent` replaces the host's content with the new markup and keeps every node the
markup still contains, so a re-render keeps the focused control, its selection and an input
method composition; `connection.sync()` then sets the live control values.
The HTML renderer returns fragments and does not create the outer `form` element,
bind browser events, validate data or load records.

Validate `submission` with `validate(spec, submission)` from `@crudui/validator`
and the original spec. The server assigns saved sequences; apply each returned key to its specific
collection path. Never replace a token across the entire data object.

## Checks

```sh
npm run test:forms
npm test -w @crudui/validator
make docs-check
```

Run the server validation cases from the repository root:

```sh
node scripts/run-tests.mjs phpunit --cwd packages/validator-php -- --filter ValidateConformanceTest
node scripts/run-tests.mjs go --cwd packages/validator-go -- ./validator/validate
node scripts/run-tests.mjs cargo -- --locked --manifest-path packages/validator-rust/Cargo.toml --test validate_conformance
```

`test:forms` builds current packages and runs core, SSR and mounted DOM tests.
The shared DOM scenario covers late data injection, edits, nested row operations,
saved keys, checkboxes, dates, language fields and conditional display. DOM tests
use jsdom; they do not establish external editor or browser file-picker behavior.
`tests/form-styles.test.mjs` checks the layout of `crudui.css` in Chromium, Firefox and
WebKit: sticky header stacking, the level label and its `data-crudui-stuck` fallback, one-border
seams, row card edges and focus scrolling, each in a page, a scrolling box and a frame. Every
engine runs the same scenarios; Chromium and Firefox are driven by Puppeteer, WebKit by
Playwright. Firefox is found at `CRUDUI_FIREFOX_EXECUTABLE` or the platform's install path, and
WebKit is installed with `npx playwright install --with-deps webkit`. A missing browser fails the
run; no engine is skipped.
Record current results in [features](../features.md) and [changelog](../../CHANGELOG.md).

The Svelte package build emits JavaScript, preprocessed Svelte components and
TypeScript declarations into `dist`. Public export entries reference these
packaged files. Consumers compile components for their browser or SSR target.

Run `npm run test:packages` to build and pack all JavaScript packages, install
them into an isolated consumer project, check exported files and declarations,
and compile a production application using all three form components. A passing
check removes the temporary consumer project. A failing check keeps it with
`failure.log` and prints its path.

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
