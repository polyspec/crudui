# Feature contracts

[한국어](feature-contracts.ko.md).

This page is generated from [contracts/features.json](../../contracts/features.json). Each feature connects its input, output, state, errors, support status, fixtures, executable tests and documentation. `planned` and `partial` are incomplete states.

| Feature | Status | Owner package | Support status | Verification |
| --- | --- | --- | --- | --- |
| `compileForm` | implemented | `@crudui/generator-core` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass | 2 command(s) |
| `bindForm` | implemented | `@crudui/generator-core` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass | 2 command(s) |
| `bindButtons` | implemented | `@crudui/generator-core` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass | 1 command(s) |
| `formButtonsHtml` | implemented | `@crudui/generator-core` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass | 1 command(s) |
| `createForm` | implemented | `@crudui/generator-core` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass | 2 command(s) |
| `renderForm` | implemented | `@crudui/generator-html` | javascript-html: pass<br>react: pass<br>vue: pass<br>svelte: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass | 2 command(s) |
| `renderList` | implemented | `@crudui/generator-html` | javascript-html: pass<br>react: pass<br>vue: pass<br>svelte: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass | 2 command(s) |
| `buildDetail` | partial | `@crudui/generator-core` | javascript: pass<br>php: unsupported<br>go: pass<br>rust: unsupported<br>php-native: unsupported | 1 command(s) |
| `renderDetail` | partial | `@crudui/generator-html` | javascript-html: pass<br>react: pass<br>vue: pass<br>svelte: pass<br>php: unsupported<br>go: pass<br>rust: unsupported<br>php-native: unsupported | 1 command(s) |
| `validateDetail` | partial | `@crudui/validator` | javascript: pass<br>php: unsupported<br>go: unsupported<br>rust: unsupported<br>php-native: unsupported | 1 command(s) |
| `connectForm` | implemented | `@crudui/generator-core` | javascript-dom: pass<br>react: pass<br>vue: pass<br>svelte: pass | 2 command(s) |
| `buildOutline` | implemented | `@crudui/generator-core` | javascript: pass<br>php: unsupported<br>go: unsupported<br>rust: unsupported<br>php-native: unsupported | 1 command(s) |
| `connectOutline` | implemented | `@crudui/generator-core` | javascript-dom: pass<br>react: pass<br>vue: pass<br>svelte: pass | 1 command(s) |
| `runAction` | implemented | `@crudui/generator-core` | javascript: pass<br>php: unsupported<br>go: unsupported<br>rust: unsupported<br>php-native: unsupported | 1 command(s) |
| `viewState` | implemented | `@crudui/generator-core` | javascript: pass<br>php: unsupported<br>go: unsupported<br>rust: unsupported<br>php-native: unsupported | 1 command(s) |
| `formHistory` | implemented | `@crudui/generator-core` | javascript: pass<br>php: unsupported<br>go: unsupported<br>rust: unsupported<br>php-native: unsupported | 1 command(s) |
| `validate` | implemented | `@crudui/validator` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass | 1 command(s) |

Run `npm run manifest:check` to validate structure and links. Run `npm run manifest:test` to execute the declared test commands.
