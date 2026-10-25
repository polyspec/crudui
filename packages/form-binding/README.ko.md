# @polyspec/crudui-form-binding
<!-- doc-id: packages-form-binding-readme -->
<!-- source-sha256: 9bb95f97aa0d9bacb55c4746b64e551fbbca4bcd23c7d214fcbd6fc40e8a9b61 -->

[English](README.md).

서버가 렌더링한 CRUDUI 폼을 서버가 검증할 때 쓰는 스펙으로 브라우저에서 검증합니다. 이 패키지는
브라우저에서만 실행되며 `@polyspec/crudui-validator`, `@polyspec/crudui-generator-core`,
`@polyspec/crudui-generator-html`에 의존합니다.

```ts
import { bindForm } from '@polyspec/crudui-form-binding';

const spec = JSON.parse(document.querySelector('#member-spec')!.textContent!);
const binding = bindForm(document.querySelector('form')!, spec, { keyPrefix: 'form' });
```

`bindForm(form, spec, options)`는 `renderForm`이 `options.action`으로 쓴 완전한 폼 하나를 담고 파싱이
끝난 `form` 요소를 연결합니다. 네이티브 제출이 보내는 대로 폼 컨트롤에서 데이터를 만들고, 바뀐 필드를
컨트롤이 포커스를 잃을 때와 그 뒤의 모든 변경에서 검증하며, 제출할 때 폼 전체를 검증합니다. 같은
오류에 대해 `renderForm`이 쓰는 오류 마크업을 쓰고, 오류가 있는 필드의 컨트롤에 `aria-invalid`를
설정하며, htmx 같은 다른 `submit` 리스너가 받기 전에 유효하지 않은 제출을 취소합니다.
`options.keyPrefix`는 컴파일한 템플릿의 키 접두사이고, `options.message(error)`는 오류의 문구를,
`options.formErrors(result)`는 폼 오류를 반환하며, `options.language`와 `options.idPrefix`는 서버가 폼을
렌더링할 때 쓴 언어와 식별자 접두사입니다. 반환한 객체에는 폼 전체를 검증하고 결과를
반환하는 `validate()`와 `dispose()`가 있습니다.

서버는 모든 제출을 검증합니다. 바인딩은 요청을 보내기 전에 오류를 보여 줍니다.

- [브라우저 검증 계약](../../docs/spec/form-runtime.ko.md#브라우저-검증)
- [검증 절차](../../docs/operations/validation.ko.md#브라우저-검증)

## 브라우저 검증

`@polyspec/crudui-form-binding`(`packages/form-binding`)은 서버가 렌더링한 폼을 서버가 적용하는 규칙으로
브라우저에서 검증합니다. 브라우저에서만 실행되는 ESM 패키지이며 `@polyspec/crudui-validator`,
`@polyspec/crudui-generator-core`, `@polyspec/crudui-generator-html`에 의존합니다.
서버가 최종 권한을 가집니다. 바인딩은 오류를 더 일찍 보여 주고 유효하지 않다고 판단한 제출을
멈추며, 서버는 받은 모든 제출을 검증합니다.

브라우저 바인딩은 사용자 입력과 행 작업을 적용합니다. 서버 런타임은 브라우저의 포커스, 선택 영역, 스크롤 동작을 구현하지 않습니다.

`bindForm(form, spec, options)`는 [완전한 폼](../../docs/spec/form-runtime.ko.md#완전한-폼) 하나를 담고 파싱이 끝난 `form` 요소 하나를
연결하고 `{ validate(), dispose() }`를 반환합니다. generator-core의 `bindForm(template, data, options)`와는
다른 작업입니다. `spec`은 서버가 같은 폼을 검증할 때 쓰는 스펙이며 합성이 해석된 상태입니다.
`validate()`는 제출과 같이 폼 전체를 검증하고 검증 결과를 반환합니다. `bindForm`은 form 요소에
`novalidate`를 설정합니다. 따라서 `email` 컨트롤의 형식 검사 같은 브라우저 자체의 제약 검증이 바인딩의
검증보다 먼저 제출을 멈추지 않으며, 유효성은 규칙만으로 정합니다. `dispose()`는 바인딩의 모든 리스너를
제거하고, 폼에 원래 없던 `novalidate` 속성을 제거하며, 오류 마크업은 그대로 둡니다. `options`의 모든
멤버는 선택입니다.

- `message` — 값: 검증 오류에서 문자열로 가는 함수; 용도: 그 오류에 보여 줄 문구입니다. 없으면 오류의 `message`를 씁니다.
- `formErrors` — 값: 검증 결과에서 문자열 목록으로 가는 함수; 용도: 폼 전체를 검증할 때마다 쓰는 폼 오류입니다. 없으면 쓰지 않습니다.
- `language` — 값: 문자열; 용도: 서버가 폼을 렌더링할 때 쓴 언어이며, 바인딩은 이 언어로 [그룹 소스의 선택지](#반복-그룹의-선택지)를 렌더링합니다. 없으면 렌더러의 기본 언어를 씁니다.
- `idPrefix` — 값: 문자열; 용도: 서버가 폼을 렌더링할 때 쓴 식별자 접두사이며, 바인딩은 이 접두사로 그룹 소스의 선택지를 렌더링합니다. 없으면 렌더러의 기본 접두사를 씁니다.

`bindForm`은 `TypeError`와 다음 메시지 중 첫 번째로 이 순서에 따라 실패합니다.

- `form` 요소가 아닌 `form`: `bindForm requires a form element`
- 객체가 아닌 `options`: `Binding options must be an object`
- `keyPrefix`, `message`, `formErrors`, `language`, `idPrefix` 이외의 `options` 멤버 중 멤버 순서로 첫 번째: `Unknown binding option: {name}`
- 문자열이 아닌 `keyPrefix`: `keyPrefix must be a string`
- 함수가 아닌 `message`: `message must be a function`
- 함수가 아닌 `formErrors`: `formErrors must be a function`
- 문자열이 아닌 `language`: `language must be a string`
- 문자열이 아닌 `idPrefix`: `idPrefix must be a string`
- `crudui-form__body`를 정확히 하나 담지 않은 폼: `The form must contain one CRUDUI form`

`message`가 문자열이 아닌 값을 반환하면(`message must return a string`), `formErrors`가 문자열
목록이 아닌 값을 반환하면(`formErrors must return a list of strings`) 검증은 `TypeError`로 실패합니다.
형태가 잘못된 데이터나 렌더러가 지원하지 않는 언어에 대한 `FormInputError` 같은 검증기나 렌더러의 실패는 그대로
전달됩니다.

### 데이터

바인딩은 CRUDUI 폼의 컨트롤에서 데이터를 만듭니다. 네이티브 제출이 보내는 값이며, 서버가 대괄호
이름을 디코딩한 뒤 받는 값(키 접두사를 뺀 PHP의 `$_POST`)과 같습니다. 컨트롤은 비어 있지 않은
`name`을 가진 `input`, `select`, `textarea`이고, 폼의 노드(폼 본문 안에서 `data-field-path`나
`data-crudui-row-key`를 가진 요소) 안에 있고, 비활성화되지 않았을 때 참여합니다. `renderForm`의
`hidden` input과 폼 버튼처럼 노드 밖에 있는 컨트롤은 참여하지 않습니다. `design.show`가 숨긴
노드의 컨트롤은 제출과 같이 참여합니다.

- 유형이 `text`, `email`, `password`, `number`, `range`, `date`, `datetime-local`, `hidden`이거나 아래에 없는 다른 유형인 `input`, 그리고 아래에서 표시하지 않은 `textarea`: 현재 값인 문자열입니다. 숫자는 컨트롤이 담은 텍스트이고, range는 브라우저가 담은 값(렌더링한 값이 비어 있으면 범위의 중간값)이며, 날짜와 날짜시간은 브라우저가 제출하는 텍스트입니다.
- `data-crudui-value="json"`으로 표시한 `textarea`, 즉 조건 필드의 컨트롤: 텍스트를 디코딩한 값입니다([조건 값](../../docs/spec/form-runtime.ko.md#조건-값)). JSON 텍스트이면 그 값이고 그렇지 않으면 텍스트 자체이며, 줄바꿈을 CRLF로 쓴 뒤에 읽습니다.
- 유형이 `checkbox`(스위치 포함)나 `radio`인 `input`: 선택되었으면 그 `value`이고 선택되지 않았으면 없습니다.
- 단일 또는 `multiple` `select`: `optgroup` 안에 있든 없든 선택된 옵션마다 그 값이며 선택된 옵션이 없으면 없습니다.
- 유형이 `file`인 `input`: 없습니다. 브라우저는 서버가 파일에 대해 받는 값을 만들 수 없습니다.

각 항목은 이름이 가리키는 경로에 놓입니다. 이름은 `{first}[{segment}]…`이고 `[]`로 끝날 수 있습니다.
키 접두사가 있으면 첫 세그먼트가 그 접두사와 같아야 하며 제거됩니다. 각 세그먼트는 객체 멤버를
가리키므로 반복 행은 행 키를 키로 가진 객체입니다. `[]`로 끝나는 이름은 그 경로의 목록에 값을 컨트롤
순서로 덧붙입니다. 조건 컨트롤의 값을 뺀 모든 값은 문자열이며, 값 안의 줄바꿈은 제출이 인코딩하는 대로 CRLF로 씁니다.

멤버는 네이티브 제출이 아무것도 보내지 않는 곳에서만 없습니다. 선택되지 않은 체크박스, 선택된
옵션이 없는 선택지나 체크박스 묶음, 선택된 옵션이 없는 select, 행이 없는 컬렉션이 그렇습니다.
비어 있는 텍스트 컨트롤은 빈 문자열 `""`입니다.

수집은 `FormInputError`(코드 `INVALID_FORM_INPUT`)와 다음 메시지 중 첫 번째로 컨트롤 순서에 따라
실패합니다.

- 위 형태가 아님: `Malformed control name: {name}`
- 첫 세그먼트가 키 접두사가 아님: `Control name outside the key prefix: {name}`
- 한 경로가 값, 목록, 멤버 중 둘 이상을 가지게 됨: `Control name is both a value and a group: {name}`
- `[]` 없는 이름에 두 번째 항목이 있음: `Repeated control name: {name}`

검증기는 이 데이터를 그대로 받습니다. 경로가 파일 컨트롤을 담은 노드의 데이터 경로인 오류는
결과에서 제거합니다. 서버가 받은 파일로 그 노드를 검증합니다. 남은 오류가 없으면 결과의
`valid`는 참입니다.

### 오류 표시

바인딩은 같은 `errors`와 `formErrors`에 대해 `renderForm`이 쓰는 마크업을 씁니다. 노드를 쓰면 서버가
썼든 바인딩이 썼든 그 노드의 `crudui-node__errors` 슬롯을 제거하고, 노드에 오류가 있으면
`crudui-node__body` 바로 뒤에 새 슬롯을 넣고 오류마다 `crudui-node__error` 문단 하나를 결과 순서로
넣습니다. 오류의 노드는 데이터 경로가 오류의 `path`와 같은 노드입니다([완전한 폼](../../docs/spec/form-runtime.ko.md#완전한-폼) 참조).
경로가 어떤 노드도 가리키지 않는 오류는 `FormInputError`와 메시지 `Unknown error path: {path}`로
실패합니다. 폼 오류를 쓰면 `crudui-form__errors` 요소를 제거하고, `formErrors`가 문구를 반환하면
`crudui-form__body` 바로 앞에 새 요소를 넣고 문구마다 `crudui-form__error` 문단 하나를 넣습니다.

노드의 컨트롤은 데이터에 참여하는 컨트롤 중 가장 가까운 노드가 그 노드인 컨트롤입니다. lang 노드의
컨트롤은 그 lang-item의 컨트롤입니다. 오류가 있는 노드를 쓰면 그 컨트롤에 `aria-invalid="true"`를
설정하고, 오류가 없는 노드를 쓰면 그 컨트롤에서 `aria-invalid`를 제거합니다.

### 시점

- 사용자가 노드의 컨트롤을 바꾼 뒤(`input` 또는 `change` 이벤트) 그 노드의 컨트롤이 포커스를 잃을 때
  노드를 검증하고, 그 뒤로는 그 노드의 `input`이나 `change` 이벤트마다 검증합니다. 이 검증은 매번 전체
  데이터를 검증하고 바인딩 이후 검증된 모든 노드를 씁니다. 따라서 노드는 처음 검증될 때까지 서버가
  렌더링한 오류를 유지합니다.
- 폼의 `submit` 이벤트마다, 그리고 `validate()` 호출마다 폼 전체를 검증합니다. 이 검증은 모든 노드와
  폼 오류를 쓰며, 그 뒤로 모든 노드는 검증된 노드입니다.
- 바인딩은 캡처 단계에서 window의 `submit`을 들으므로 문서나 폼의 어떤 리스너보다 먼저 실행됩니다.
  폼이 유효하지 않으면 `preventDefault()`와 `stopImmediatePropagation()`을 호출하므로 브라우저도,
  htmx처럼 `submit`을 듣는 라이브러리도 요청을 보내지 않습니다. 그다음 문서 순서로 오류가 있는 노드
  안에 있고 `hidden` 조상이 없는 첫 번째 활성 컨트롤로 포커스를 옮깁니다. 바인딩은 스크롤 없이
  포커스를 주고 필요한 만큼만 스크롤해 보이게 하며, 포커스는 보이게 표시합니다. 유효한 폼은 정상적으로
  제출됩니다. `form.submit()`은 `submit` 이벤트를 발생시키지 않으므로 검증되지 않습니다. 오류로
  실패한 검증은 제출을 취소하지 않으며 서버가 그 제출을 검증합니다.
- 렌더러가 폼을 다시 쓰면 바인딩의 마크업이 바뀌며, 다음 검증이 다시 씁니다.

`valid-target`은 규칙이 값을 검사하는 컨트롤을 표시하고, `valid-target-async`는 실행 중에
동적 소스(`model`을 가진 `items`)에서 옵션을 불러오는 select를 표시합니다. 바인딩은 두 클래스를 읽지
않습니다. 컨트롤은 `name`과 노드로 찾고, 동적 소스 select는 검증할 때 선택된 값으로 검증합니다.

### 표시

바인딩은 노드의 표시 여부를 데이터에 맞게 유지하며, 같은 데이터에 대해 렌더러가 쓰는 것과 같게 씁니다.
그래서 `design.show`가 다른 필드를 읽는 필드나 그룹은 사용자가 입력하는 동안 나타나고 사라집니다.
바인딩할 때와 폼 컨트롤의 `input` 또는 `change` 이벤트마다 검증하기 전에, [데이터](#데이터)에서 설명한
대로 데이터를 만들고 `@polyspec/crudui-validator`의 `hiddenPaths(spec, data)`를 읽습니다. 이 목록은 `design.show`가
데이터에 대해 `false`로 결정되는 필드의 데이터 경로를 선언 순서로 담으며, 그룹 행의 필드는 행 키 아래
경로를 가지고, 숨은 필드 안의 필드도 포함합니다. `data-field-path`가 있는 노드는 경로가 그 목록에 있을 때만
`hidden` 속성을 가지며, 행 노드와 lang item은 자신의 속성을 유지합니다. 노드가 숨겨지면 바인딩은 그 노드와
그 안의 모든 노드의 오류와 컨트롤의 `aria-invalid`를 지웁니다. 검증은 숨은 필드의 규칙을 평가하지 않기
때문입니다. 바인딩은 값을 바꾸지 않습니다. 숨은 노드의 컨트롤은 값을 유지하며 제출할 때처럼 데이터에
참여합니다.

`hiddenPaths`는 모든 조건을 검증과 같이 결정하고 다른 형태의 데이터는 없는 것으로 읽습니다. 객체가 아닌
데이터에는 `FormInputError`로, 파일 없이 합성을 해결할 수 없는 명세에는 `ComposeLoadError`로 실패합니다.

### 반복 그룹의 선택지

바인딩은 `items`가 [그룹 소스](../../docs/spec/schema.ko.md#반복-그룹의-선택지)인 모든 필드의 선택지를, 렌더러가 같은
데이터에 대해 쓰는 대로 데이터에 있는 그 그룹의 행과 같게 유지합니다(CUSC-071). 따라서 다른 그룹의 행을 나열하는
선택 목록, 라디오, 체크박스 필드는 사용자가 그 그룹을 편집하는 동안 선택지를 바꿉니다. `bindForm`은
`@polyspec/crudui-generator-core`의 `compileForm`과 `keyPrefix`로 `spec`을 한 번 컴파일하며, 그룹 소스가 없는 스펙에
대해서는 아무것도 렌더링하지 않습니다. 연결할 때와 폼 컨트롤의 `input` 또는 `change` 이벤트마다, 표시 여부를 쓰고
검증하기 전에 [데이터](#데이터)에 설명한 대로 데이터를 만들고 `@polyspec/crudui-generator-html`의 `renderForm`으로
`options.language`와 `options.idPrefix`를 써서 그 데이터의 폼을 렌더링합니다. 그룹 소스가 있는 필드의 노드마다
`@polyspec/crudui-generator-core`의 `patchContent`로 노드의 `crudui-node__body`를 렌더러가 그 노드에 쓰는 본문으로
패치하며, `patchContent`는 새 마크업이 유지하는 요소를 모두 유지합니다. 그다음 패치한 컨트롤의 선택을 패치 전에
컨트롤이 가졌던 값으로 설정합니다. 옵션이나 체크박스, 라디오 input은 그 값이 선택되어 있었을 때만 선택되고, 값이 더
이상 선택지가 아닌 select에는 선택된 옵션이 없습니다. 따라서 더 이상 선택지가 아닌 값은 어떤 컨트롤도 갖지 않으며,
네이티브 제출이 보내는 것처럼 데이터에 그 값이 없습니다. `aria-invalid`가 있던 노드의 컨트롤은 그 속성을 유지합니다.

## 브라우저 바인딩 인수 기준

- 서버가 렌더링한 폼을 브라우저에서 연결해 같은 오류에 대해 `renderForm`이 쓰는 오류 마크업을 쓰고,
  Chromium, Firefox, WebKit에서 바뀐 필드가 포커스를 잃으면 오류를 보이며, 유효하지 않은 제출은 요청을 보내지 않고,
  고친 폼은 제출되는지 확인합니다.
