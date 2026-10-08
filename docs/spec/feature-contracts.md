# Feature contracts
<!-- doc-id: docs-spec-feature-contracts -->

[한국어](feature-contracts.ko.md).

This page is generated from [contracts/features.json](../../contracts/features.json). Each feature connects its input, output, state, errors, support status, fixtures, executable tests and documentation. `planned` and `partial` are incomplete states.

| Feature | Status | Owner package | Support status | Verification |
| --- | --- | --- | --- | --- |
| `compileForm` | implemented | `@polyspec/crudui-generator-core` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 3 command(s) |
| `bindForm` | implemented | `@polyspec/crudui-generator-core` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 3 command(s) |
| `bindButtons` | implemented | `@polyspec/crudui-generator-core` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 1 command(s) |
| `formButtonsHtml` | implemented | `@polyspec/crudui-generator-core` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 1 command(s) |
| `createForm` | implemented | `@polyspec/crudui-generator-core` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: partial | 3 command(s) |
| `renderForm` | implemented | `@polyspec/crudui-generator-html` | javascript-html: pass<br>react: pass<br>vue: pass<br>svelte: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 4 command(s) |
| `renderList` | implemented | `@polyspec/crudui-generator-html` | javascript-html: pass<br>react: pass<br>vue: pass<br>svelte: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 2 command(s) |
| `buildList` | implemented | `@polyspec/crudui-generator-core` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 2 command(s) |
| `buildDetail` | implemented | `@polyspec/crudui-generator-core` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 2 command(s) |
| `renderDetail` | implemented | `@polyspec/crudui-generator-html` | javascript-html: pass<br>react: pass<br>vue: pass<br>svelte: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 2 command(s) |
| `validateDetail` | implemented | `@polyspec/crudui-validator` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 3 command(s) |
| `connectForm` | implemented | `@polyspec/crudui-generator-core` | javascript-dom: pass<br>react: pass<br>vue: pass<br>svelte: pass | 2 command(s) |
| `patchContent` | implemented | `@polyspec/crudui-generator-core` | javascript-dom: pass | 2 command(s) |
| `updateView` | implemented | `@polyspec/crudui-generator-core` | javascript-dom: pass<br>react: pass<br>vue: pass<br>svelte: pass | 2 command(s) |
| `buildOutline` | implemented | `@polyspec/crudui-generator-core` | javascript-html: pass<br>react: pass<br>vue: pass<br>svelte: pass<br>php: unsupported<br>go: unsupported<br>rust: unsupported<br>php-native: unsupported<br>python: unsupported | 1 command(s) |
| `connectOutline` | implemented | `@polyspec/crudui-generator-core` | javascript-dom: pass<br>react: pass<br>vue: pass<br>svelte: pass | 1 command(s) |
| `runAction` | implemented | `@polyspec/crudui-generator-core` | javascript-dom: pass<br>react: pass<br>vue: pass<br>svelte: pass<br>php: unsupported<br>go: unsupported<br>rust: unsupported<br>php-native: unsupported<br>python: unsupported | 1 command(s) |
| `viewState` | implemented | `@polyspec/crudui-generator-core` | javascript-dom: pass<br>react: pass<br>vue: pass<br>svelte: pass<br>php: unsupported<br>go: unsupported<br>rust: unsupported<br>php-native: unsupported<br>python: unsupported | 1 command(s) |
| `formHistory` | implemented | `@polyspec/crudui-generator-core` | javascript-dom: pass<br>react: pass<br>vue: pass<br>svelte: pass<br>php: unsupported<br>go: unsupported<br>rust: unsupported<br>php-native: unsupported<br>python: unsupported | 1 command(s) |
| `validate` | implemented | `@polyspec/crudui-validator` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 2 command(s) |
| `validateList` | implemented | `@polyspec/crudui-validator` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 2 command(s) |

## Package entries

Each package declares every JavaScript entry of its `package.json` `exports` map with its value exports. A `public` entry is public API. An `internal` entry serves CRUDUI's own packages only: examples, tests and documents do not import it, and it changes without notice.

| Package | Entry | Visibility | Value exports |
| --- | --- | --- | --- |
| `@polyspec/crudui-generator-core` | `.` | public | `ComposeLoadError`, `FormInputError`, `FormInstance`, `UnsupportedFieldTypeError`, `bindButtons`, `bindForm`, `buildDetail`, `buildList`, `buildOutline`, `canRedo`, `canUndo`, `collapsibleRows`, `compileForm`, `connectForm`, `connectOutline`, `connectStickyHeaders`, `createForm`, `createRowKey`, `emptyHistory`, `formButtonsHtml`, `formDescription`, `formMessages`, `initialView`, `patchContent`, `recordChange`, `redoChange`, `rekeyRowView`, `removeRowView`, `resolveAction`, `runAction`, `sequenceRowKey`, `setAllExpandedView`, `toggleRowView`, `undoChange` |
| `@polyspec/crudui-generator-core` | `./internal` | internal | `CELL_FORMATS`, `CELL_FORMAT_DEFAULT`, `CELL_RENDERERS`, `WIDGET_CANONICAL`, `WIDGET_COUNT`, `WIDGET_KINDS`, `WIDGET_LAYOUTS`, `buildListLayout`, `formRenderModel`, `optionSections`, `paginationPages`, `parseStyle` |
| `@polyspec/crudui-generator-html` | `.` | public | `renderData`, `renderDataPanel`, `renderDetail`, `renderForm`, `renderFormView`, `renderList`, `renderOutline`, `renderOutlineView` |
| `@polyspec/crudui-generator-react` | `.` | public | `Cell`, `Controls`, `DataPanel`, `DataView`, `Detail`, `Form`, `List`, `Node`, `Outline`, `OutlineView`, `Widget` |
| `@polyspec/crudui-generator-react` | `./server` | public | `renderDetail`, `renderForm`, `renderList` |
| `@polyspec/crudui-generator-vue` | `.` | public | `DataView`, `Detail`, `Form`, `List`, `Outline`, `Widget`, `controlsVNode`, `dataVNode`, `nodeVNode`, `outlineVNode`, `renderDetail`, `renderForm`, `renderList` |
| `@polyspec/crudui-generator-svelte` | `.` | public | `Controls`, `DataPanel`, `DataView`, `Detail`, `Form`, `List`, `Node`, `Outline`, `OutlineView`, `Widget`, `renderDetail`, `renderForm`, `renderList` |
| `@polyspec/crudui-form-binding` | `.` | public | `bindForm` |
| `@polyspec/crudui-validator` | `.` | public | `ComposeLoadError`, `FormInputError`, `hiddenPaths`, `validate`, `validateDetail`, `validateList` |
| `@polyspec/crudui-validator` | `./internal` | internal | `ARRAY_LEVEL_RULES`, `FORBIDDEN_META_KEYS`, `FORBIDDEN_META_KEY_PATTERN`, `INVALID_TEXT_MESSAGE`, `LITERAL_PARAM_RULES`, `MEMBERSHIP_PARAM_RULES`, `MemoryLoader`, `PATH_REFERENCE_RULES`, `REGEX_PARAM_RULES`, `Validator`, `checkInputText`, `checkOptionText`, `checkSpecificationText`, `checkedComposition`, `checkedLoader`, `compareCodePoints`, `composeProperties`, `composeSpec`, `evaluateCondition`, `evaluateExpressionValue`, `getRuleNames`, `isConditionExpression`, `isMultiple`, `isNumberRange`, `isScalarText`, `isStep`, `parseCondition`, `parseJsonDocument`, `scanForbiddenKeys` |

Run `npm run manifest:check` to validate structure and links. Run `npm run manifest:test` to execute the declared test commands.
