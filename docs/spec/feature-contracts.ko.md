# 기능 계약

[English](feature-contracts.md).

이 페이지는 [contracts/features.json](../../contracts/features.json)에서 생성합니다. 각 기능은 입력, 출력, 상태, 오류, 지원 상태, fixture, 실행 테스트와 문서를 연결합니다. `planned`와 `partial`은 미완료 상태입니다.

| 기능 | 상태 | 담당 패키지 | 지원 상태 | 검증 명령 |
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

## 패키지 진입점

각 패키지는 `package.json` `exports`의 모든 JavaScript 진입점과 그 값 export를 선언합니다. `public` 진입점은 애플리케이션 API입니다. `internal` 진입점은 CRUDUI 자체 패키지만 사용합니다. 애플리케이션, 예제, 테스트와 문서는 이를 가져오지 않으며, 예고 없이 바뀝니다.

| 패키지 | 진입점 | 공개 범위 | 값 export |
| --- | --- | --- | --- |
| `@crudui/generator-core` | `.` | public | `ComposeLoadError`, `FormInputError`, `FormInstance`, `UnsupportedFieldTypeError`, `bindButtons`, `bindForm`, `buildDetail`, `buildList`, `buildOutline`, `canRedo`, `canUndo`, `collapsibleRows`, `compileForm`, `connectForm`, `connectOutline`, `connectStickyHeaders`, `createForm`, `createRowKey`, `emptyHistory`, `formButtonsHtml`, `formMessages`, `initialView`, `patchContent`, `recordChange`, `redoChange`, `rekeyRowView`, `removeRowView`, `resolveAction`, `runAction`, `sequenceRowKey`, `setAllExpandedView`, `toggleRowView`, `undoChange` |
| `@crudui/generator-core` | `./internal` | internal | `CELL_FORMATS`, `CELL_FORMAT_DEFAULT`, `CELL_RENDERERS`, `WIDGET_CANONICAL`, `WIDGET_COUNT`, `WIDGET_KINDS`, `WIDGET_LAYOUTS`, `listLayout`, `paginationPages`, `parseStyle` |
| `@crudui/generator-html` | `.` | public | `renderData`, `renderDataPanel`, `renderDetail`, `renderForm`, `renderFormView`, `renderList`, `renderOutline`, `renderOutlineView` |
| `@crudui/generator-react` | `.` | public | `Cell`, `Controls`, `DataPanel`, `DataView`, `Detail`, `Form`, `List`, `Node`, `Outline`, `OutlineView`, `Widget`, `renderDetail`, `renderForm`, `renderList` |
| `@crudui/generator-vue` | `.` | public | `DataView`, `Detail`, `Form`, `List`, `Outline`, `Widget`, `controlsVNode`, `dataVNode`, `nodeVNode`, `outlineVNode`, `renderDetail`, `renderForm`, `renderList` |
| `@crudui/generator-svelte` | `.` | public | `Controls`, `DataPanel`, `DataView`, `Detail`, `Form`, `List`, `Node`, `Outline`, `OutlineView`, `Widget`, `renderDetail`, `renderForm`, `renderList` |
| `@crudui/validator` | `.` | public | `ComposeLoadError`, `FormInputError`, `validate`, `validateDetail`, `validateList` |
| `@crudui/validator` | `./internal` | internal | `ARRAY_LEVEL_RULES`, `FORBIDDEN_META_KEYS`, `FORBIDDEN_META_KEY_PATTERN`, `LITERAL_PARAM_RULES`, `MEMBERSHIP_PARAM_RULES`, `MemoryLoader`, `PATH_REFERENCE_RULES`, `REGEX_PARAM_RULES`, `Validator`, `composeProperties`, `composeSpec`, `evaluateCondition`, `evaluateExpressionValue`, `getRuleNames`, `isConditionExpression`, `parseCondition`, `scanForbiddenKeys` |

구조와 연결은 `npm run manifest:check`로 검사하고, 선언된 테스트 명령은 `npm run manifest:test`로 실행합니다.
