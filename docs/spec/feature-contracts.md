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
| `buildList` | implemented | `@crudui/generator-core` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass | 1 command(s) |
| `buildDetail` | implemented | `@crudui/generator-core` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass | 1 command(s) |
| `renderDetail` | implemented | `@crudui/generator-html` | javascript-html: pass<br>react: pass<br>vue: pass<br>svelte: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass | 2 command(s) |
| `validateDetail` | implemented | `@crudui/validator` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass | 2 command(s) |
| `connectForm` | implemented | `@crudui/generator-core` | javascript-dom: pass<br>react: pass<br>vue: pass<br>svelte: pass | 2 command(s) |
| `patchContent` | implemented | `@crudui/generator-core` | javascript-dom: pass | 2 command(s) |
| `buildOutline` | implemented | `@crudui/generator-core` | javascript-html: pass<br>react: pass<br>vue: pass<br>svelte: pass<br>php: unsupported<br>go: unsupported<br>rust: unsupported<br>php-native: unsupported | 1 command(s) |
| `connectOutline` | implemented | `@crudui/generator-core` | javascript-dom: pass<br>react: pass<br>vue: pass<br>svelte: pass | 1 command(s) |
| `runAction` | implemented | `@crudui/generator-core` | javascript-dom: pass<br>react: pass<br>vue: pass<br>svelte: pass<br>php: unsupported<br>go: unsupported<br>rust: unsupported<br>php-native: unsupported | 1 command(s) |
| `viewState` | implemented | `@crudui/generator-core` | javascript-dom: pass<br>react: pass<br>vue: pass<br>svelte: pass<br>php: unsupported<br>go: unsupported<br>rust: unsupported<br>php-native: unsupported | 1 command(s) |
| `formHistory` | implemented | `@crudui/generator-core` | javascript-dom: pass<br>react: pass<br>vue: pass<br>svelte: pass<br>php: unsupported<br>go: unsupported<br>rust: unsupported<br>php-native: unsupported | 1 command(s) |
| `validate` | implemented | `@crudui/validator` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass | 1 command(s) |
| `validateList` | implemented | `@crudui/validator` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass | 1 command(s) |

## Package entries

Each package declares every JavaScript entry of its `package.json` `exports` map with its value exports. A `public` entry is application API. An `internal` entry serves CRUDUI's own packages only: applications, examples, tests and documents do not import it, and it changes without notice.

| Package | Entry | Visibility | Value exports |
| --- | --- | --- | --- |
| `@crudui/generator-core` | `.` | public | `ComposeLoadError`, `FormInputError`, `FormInstance`, `UnsupportedFieldTypeError`, `bindButtons`, `bindForm`, `buildDetail`, `buildList`, `buildOutline`, `canRedo`, `canUndo`, `collapsibleRows`, `compileForm`, `connectForm`, `connectOutline`, `connectStickyHeaders`, `createForm`, `createRowKey`, `emptyHistory`, `formButtonsHtml`, `formMessages`, `initialView`, `patchContent`, `recordChange`, `redoChange`, `rekeyRowView`, `removeRowView`, `resolveAction`, `runAction`, `sequenceRowKey`, `setAllExpandedView`, `toggleRowView`, `undoChange` |
| `@crudui/generator-core` | `./internal` | internal | `CELL_FORMATS`, `CELL_FORMAT_DEFAULT`, `CELL_RENDERERS`, `WIDGET_CANONICAL`, `WIDGET_COUNT`, `WIDGET_KINDS`, `WIDGET_LAYOUTS`, `listLayout`, `paginationPages`, `parseStyle` |
| `@crudui/generator-html` | `.` | public | `renderData`, `renderDataPanel`, `renderDetail`, `renderForm`, `renderFormView`, `renderList`, `renderOutline`, `renderOutlineView` |
| `@crudui/generator-react` | `.` | public | `Cell`, `Controls`, `DataPanel`, `DataView`, `Detail`, `Form`, `List`, `Node`, `Outline`, `OutlineView`, `Widget`, `renderDetail`, `renderForm`, `renderList` |
| `@crudui/generator-vue` | `.` | public | `DataView`, `Detail`, `Form`, `List`, `Outline`, `Widget`, `controlsVNode`, `dataVNode`, `nodeVNode`, `outlineVNode`, `renderDetail`, `renderForm`, `renderList` |
| `@crudui/generator-svelte` | `.` | public | `Controls`, `DataPanel`, `DataView`, `Detail`, `Form`, `List`, `Node`, `Outline`, `OutlineView`, `Widget`, `renderDetail`, `renderForm`, `renderList` |
| `@crudui/validator` | `.` | public | `ComposeLoadError`, `FormInputError`, `validate`, `validateDetail`, `validateList` |
| `@crudui/validator` | `./internal` | internal | `ARRAY_LEVEL_RULES`, `FORBIDDEN_META_KEYS`, `FORBIDDEN_META_KEY_PATTERN`, `LITERAL_PARAM_RULES`, `MEMBERSHIP_PARAM_RULES`, `MemoryLoader`, `PATH_REFERENCE_RULES`, `REGEX_PARAM_RULES`, `Validator`, `composeProperties`, `composeSpec`, `evaluateCondition`, `evaluateExpressionValue`, `getRuleNames`, `isConditionExpression`, `parseCondition`, `scanForbiddenKeys` |

Run `npm run manifest:check` to validate structure and links. Run `npm run manifest:test` to execute the declared test commands.
