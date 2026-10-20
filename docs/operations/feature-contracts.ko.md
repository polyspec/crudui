# 기능 계약
<!-- doc-id: docs-operations-feature-contracts -->
<!-- source-sha256: 1d8f2d429c02168d5ae34861d3cd82d8bf55e8aae2c56c48c6676b0c5a6b8fcc -->

[English](feature-contracts.md).

이 페이지는 [contracts/features.json](../../contracts/features.json)에서 생성합니다. 각 기능은 입력, 출력, 상태, 오류, 지원 상태, fixture, 실행 테스트와 문서를 연결합니다. `planned`와 `partial`은 미완료 상태입니다.

| 기능 | 상태 | 담당 패키지 | 지원 상태 | 검증 명령 |
| --- | --- | --- | --- | --- |
| `compileForm` | implemented | `@polyspec/crudui-generator-core` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 3 command(s) |
| `bindForm` | implemented | `@polyspec/crudui-generator-core` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 3 command(s) |
| `bindButtons` | implemented | `@polyspec/crudui-generator-core` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 5 command(s) |
| `formButtonsHtml` | implemented | `@polyspec/crudui-generator-core` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 5 command(s) |
| `createForm` | implemented | `@polyspec/crudui-generator-core` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 3 command(s) |
| `renderForm` | implemented | `@polyspec/crudui-generator-html` | javascript-html: pass<br>react: pass<br>vue: pass<br>svelte: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 4 command(s) |
| `renderList` | implemented | `@polyspec/crudui-generator-html` | javascript-html: pass<br>react: pass<br>vue: pass<br>svelte: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 2 command(s) |
| `buildList` | implemented | `@polyspec/crudui-generator-core` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 2 command(s) |
| `buildDetail` | implemented | `@polyspec/crudui-generator-core` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 2 command(s) |
| `renderDetail` | implemented | `@polyspec/crudui-generator-html` | javascript-html: pass<br>react: pass<br>vue: pass<br>svelte: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 2 command(s) |
| `validateDetail` | implemented | `@polyspec/crudui-validator` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 3 command(s) |
| `connectForm` | implemented | `@polyspec/crudui-generator-core` | javascript-dom: pass<br>react: pass<br>vue: pass<br>svelte: pass | 2 command(s) |
| `patchContent` | implemented | `@polyspec/crudui-generator-core` | javascript-dom: pass | 2 command(s) |
| `updateView` | implemented | `@polyspec/crudui-generator-core` | javascript-dom: pass<br>react: pass<br>vue: pass<br>svelte: pass | 2 command(s) |
| `buildOutline` | implemented | `@polyspec/crudui-generator-core` | javascript-html: pass<br>react: pass<br>vue: pass<br>svelte: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 3 command(s) |
| `connectOutline` | implemented | `@polyspec/crudui-generator-core` | javascript-dom: pass<br>react: pass<br>vue: pass<br>svelte: pass | 1 command(s) |
| `runAction` | implemented | `@polyspec/crudui-generator-core` | javascript-dom: pass<br>react: pass<br>vue: pass<br>svelte: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 5 command(s) |
| `viewState` | implemented | `@polyspec/crudui-generator-core` | javascript-dom: pass<br>react: pass<br>vue: pass<br>svelte: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 6 command(s) |
| `formHistory` | implemented | `@polyspec/crudui-generator-core` | javascript-dom: pass<br>react: pass<br>vue: pass<br>svelte: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 5 command(s) |
| `validate` | implemented | `@polyspec/crudui-validator` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 2 command(s) |
| `validateList` | implemented | `@polyspec/crudui-validator` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass<br>python: pass | 2 command(s) |

## 패키지 진입점

각 패키지는 `package.json` `exports`의 모든 JavaScript 진입점과 그 값 export를 선언합니다. `public` 진입점은 공개 API입니다. `internal` 진입점은 CRUDUI 자체 패키지만 사용합니다. 예제, 테스트와 문서는 이를 가져오지 않으며, 예고 없이 바뀝니다.

| 패키지 | 진입점 | 공개 범위 | 값 export |
| --- | --- | --- | --- |
| `@polyspec/crudui-generator-core` | `.` | public | `ComposeLoadError`, `FormInputError`, `FormInstance`, `FormRenderOptionsError`, `FormTemplateError`, `UnsupportedFieldTypeError`, `bindButtons`, `bindForm`, `buildDetail`, `buildList`, `buildOutline`, `canRedo`, `canUndo`, `collapsibleRows`, `compileForm`, `connectForm`, `connectOutline`, `connectStickyHeaders`, `createForm`, `createRowKey`, `decodeFormRenderOptions`, `decodeFormTemplate`, `emptyHistory`, `formButtonsHtml`, `formDescription`, `formMessages`, `initialView`, `patchContent`, `recordChange`, `redoChange`, `rekeyRowView`, `removeRowView`, `resolveAction`, `runAction`, `sequenceRowKey`, `setAllExpandedView`, `toggleRowView`, `undoChange` |
| `@polyspec/crudui-generator-core` | `./internal` | internal | `CELL_FORMATS`, `CELL_FORMAT_DEFAULT`, `CELL_RENDERERS`, `WIDGET_CANONICAL`, `WIDGET_COUNT`, `WIDGET_KINDS`, `WIDGET_LAYOUTS`, `actionHtml`, `affixHtml`, `buildListLayout`, `choiceLabelClass`, `choicesHtml`, `detailRenderer`, `escAttr`, `escText`, `formRenderModel`, `groupButtonHtml`, `hasEventAttr`, `isUnsupported`, `listRenderer`, `optionSections`, `paginationPages`, `parseStyle`, `rawControl`, `rawElement`, `rawOptions`, `rawVoid`, `searchHtml`, `serializeAttrs`, `sortDir`, `widgetRootHtml` |
| `@polyspec/crudui-generator-html` | `.` | public | `renderData`, `renderDataPanel`, `renderDetail`, `renderForm`, `renderFormView`, `renderList`, `renderOutline`, `renderOutlineView` |
| `@polyspec/crudui-generator-react` | `.` | public | `Cell`, `Controls`, `DataPanel`, `DataView`, `Detail`, `Form`, `List`, `Node`, `Outline`, `OutlineView`, `Widget` |
| `@polyspec/crudui-generator-react` | `./server` | public | `renderDetail`, `renderForm`, `renderList` |
| `@polyspec/crudui-generator-vue` | `.` | public | `DataView`, `Detail`, `Form`, `List`, `Outline`, `Widget`, `controlsVNode`, `dataVNode`, `nodeVNode`, `outlineVNode`, `renderDetail`, `renderForm`, `renderList` |
| `@polyspec/crudui-generator-svelte` | `.` | public | `Controls`, `DataPanel`, `DataView`, `Detail`, `Form`, `List`, `Node`, `Outline`, `OutlineView`, `Widget`, `renderDetail`, `renderForm`, `renderList` |
| `@polyspec/crudui-form-binding` | `.` | public | `bindForm` |
| `@polyspec/crudui-validator` | `.` | public | `ComposeLoadError`, `FormInputError`, `hiddenPaths`, `validate`, `validateDetail`, `validateList` |
| `@polyspec/crudui-validator` | `./internal` | internal | `ARRAY_LEVEL_RULES`, `FORBIDDEN_META_KEYS`, `FORBIDDEN_META_KEY_PATTERN`, `INVALID_TEXT_MESSAGE`, `LITERAL_PARAM_RULES`, `Lexer`, `MAX_EXPRESSION_DEPTH`, `MEMBERSHIP_PARAM_RULES`, `MemoryLoader`, `PATH_REFERENCE_RULES`, `ParseError`, `Parser`, `REGEX_PARAM_RULES`, `Validator`, `checkInputText`, `checkOptionText`, `checkSpecificationText`, `checkedComposition`, `checkedLoader`, `compareCodePoints`, `composeProperties`, `composeSpec`, `evaluateCondition`, `evaluateExpressionValue`, `getRuleNames`, `isConditionExpression`, `isMultiple`, `isNumberRange`, `isScalarText`, `isStep`, `parseCondition`, `parseJsonDocument`, `scanForbiddenKeys` |

구조와 연결은 `npm run manifest:check`로 검사하고, 선언된 테스트 명령은 `npm run manifest:test`로 실행합니다.
