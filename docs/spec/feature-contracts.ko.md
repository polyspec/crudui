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
| `buildDetail` | partial | `@crudui/generator-core` | javascript: pass<br>php: unsupported<br>go: unsupported<br>rust: unsupported<br>php-native: unsupported | 1 command(s) |
| `renderDetail` | partial | `@crudui/generator-html` | javascript-html: pass<br>react: unsupported<br>vue: unsupported<br>svelte: unsupported<br>php: unsupported<br>go: unsupported<br>rust: unsupported<br>php-native: unsupported | 1 command(s) |
| `validateDetail` | partial | `@crudui/validator` | javascript: pass<br>php: unsupported<br>go: unsupported<br>rust: unsupported<br>php-native: unsupported | 1 command(s) |
| `connectForm` | implemented | `@crudui/generator-core` | javascript-dom: pass<br>react: pass<br>vue: pass<br>svelte: pass | 2 command(s) |
| `buildOutline` | implemented | `@crudui/generator-core` | javascript: pass<br>php: unsupported<br>go: unsupported<br>rust: unsupported<br>php-native: unsupported | 1 command(s) |
| `connectOutline` | implemented | `@crudui/generator-core` | javascript-dom: pass<br>react: pass<br>vue: pass<br>svelte: pass | 1 command(s) |
| `runAction` | implemented | `@crudui/generator-core` | javascript: pass<br>php: unsupported<br>go: unsupported<br>rust: unsupported<br>php-native: unsupported | 1 command(s) |
| `viewState` | implemented | `@crudui/generator-core` | javascript: pass<br>php: unsupported<br>go: unsupported<br>rust: unsupported<br>php-native: unsupported | 1 command(s) |
| `formHistory` | implemented | `@crudui/generator-core` | javascript: pass<br>php: unsupported<br>go: unsupported<br>rust: unsupported<br>php-native: unsupported | 1 command(s) |
| `validate` | implemented | `@crudui/validator` | javascript: pass<br>php: pass<br>go: pass<br>rust: pass<br>php-native: pass | 1 command(s) |

구조와 연결은 `npm run manifest:check`로 검사하고, 선언된 테스트 명령은 `npm run manifest:test`로 실행합니다.
