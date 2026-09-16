# 폼 마크업

[English](form-markup.md). 이 문서는 평가된 폼 노드의 렌더링 방식을 정의합니다.
React, Vue, Svelte, HTML 렌더러와 네이티브 렌더러는 같은 마크업을 생성합니다.
데이터, 행 작업과 뷰 상태는 [폼 런타임](form-runtime.ko.md)에서 정의합니다.

## 클래스 이름

클래스 이름은 세 형태 중 하나이며 구분자마다 의미가 하나입니다.

| 형태 | 의미 | 예 |
| --- | --- | --- |
| `crudui-{block}` | 블록: 독립 구성 요소 | `crudui-node`, `crudui-controls` |
| `crudui-{block}__{element}` | 요소(`__`): 해당 블록 안에만 존재하는 부분 | `crudui-node__header`, `crudui-node__label` |
| `crudui-{block}--{modifier}` | 수식자(`--`): 블록의 종류 또는 변형 | `crudui-node--row`, `crudui-node--sticky` |

이름 안의 단어는 하이픈 하나로 잇습니다(`lang-item`). 수식자는 항상 기반 블록
클래스와 함께 씁니다(`class="crudui-node crudui-node--row"`). 요소 이름은 한
단계만 쓰며 요소에는 수식자를 두지 않습니다. 클래스는 스타일만 담당합니다.
브라우저 동작은 아래의 data·ARIA 속성만 읽고 클래스를 읽지 않습니다.
위젯도 같은 형태를 따릅니다. 렌더러가 그 밖에 쓰는 클래스는 검증 대상 컨트롤을 표시하는
`valid-target`과 `valid-target-async`, 에디터 호스트 `tinymcearea`, `summernote`,
`contentjs`, `tuiarea`, 그리고 스펙이 `design`으로 선언한 클래스뿐입니다.

## 블록과 속성

| 블록 | 구조 |
| --- | --- |
| `crudui-form` | `crudui-form__body`와 폼 버튼을 담은 `crudui-form__footer`를 가진 폼 루트입니다. |
| `crudui-node` | 데이터 노드 하나입니다. 종류는 아래와 같습니다. |
| `crudui-controls` | `role="group"`과 접근성 이름을 가진 버튼 묶음입니다. |
| `crudui-action` | `data-crudui-action`을 가진 버튼입니다. `crudui-action--text`는 레이블을 텍스트로 표시합니다. |
| `crudui-outline` | `__header` 폼 컨트롤과 `__body` 노드를 가진 구조 맵입니다. |
| `crudui-data` | `__header`와 `pre` `__body`를 가진 현재 데이터 보기입니다. |
| `crudui-widget` | 앞뒤 텍스트 `__affix`와 파일 위젯의 `__button`을 가진 컨트롤입니다. `--search`는 검색 select를 담고, `--unsupported`는 위젯이 없는 유형을 표시합니다. |
| `crudui-input` | 기본 input, textarea, select입니다. select는 `--select`, 파일 입력은 `--file`을 가집니다. |
| `crudui-choices` | 라디오(choice) 또는 체크박스(multichoice) 선택지입니다. 각 `__input` 뒤에 `__label`이 오고, `--multiple`은 체크박스 선택지를 줄바꿈합니다. |

| 속성 | 의미 |
| --- | --- |
| `data-field-path` | field·group·collection·lang 노드와 구조 맵 행의 데이터 경로 |
| `data-crudui-row-key` | row 노드의 행 키 |
| `data-lang` | lang-item 노드의 언어 코드 |
| `data-crudui-action` | 버튼의 작업 |
| `hidden` | `design.show`가 false인 노드, 접힌 행 본문, 펼친 행의 요약 |
| `aria-expanded`, `aria-controls` | 행 토글 상태와 제어하는 본문 |

버튼의 컬렉션 경로는 버튼 자신 또는 가장 가까운 상위 `[data-field-path]`입니다.
행 키는 그 요소 안에서 가장 가까운 `[data-crudui-row-key]`이며, 없으면 작업은
컬렉션에 적용됩니다.

## 노드

모든 데이터 노드는 `crudui-node`와 종류 수식자 하나, 그리고 `crudui-node__header`,
`crudui-node__body`, `crudui-node__footer` 슬롯을 가집니다. 헤더는 내용이 있을 때만,
푸터는 컨트롤이 있을 때만 출력합니다. 자식 노드는 본문에만, 헤더 부품은 헤더에만,
컨트롤은 헤더 또는 푸터에만 둡니다. `design.wrapper`는 노드 루트, `design.label`은
헤더, `design.group`은 group과 group 행의 본문, `design.class`는 컨트롤,
`design.prepend`는 위젯 prepend에 적용합니다.

| 종류 | 헤더 | 본문 |
| --- | --- | --- |
| `field` | `__label`, `__description` | 위젯 |
| `group` | `__label`, `__description` | 자식 노드 |
| `collection` | `__label`, `__description`, `__count` | row 노드. 행이 없으면 푸터에 `add-row` 컨트롤 |
| `row` | 토글, `__label`, `__number`, `__title`, `__summary`, 컨트롤 | 스칼라 행의 위젯 또는 group 행의 자식 노드 |
| `lang` | `__label`, `__description`, `__title`(`lang.title`) | lang-item 노드. `lang.frame`이 true(기본값)이면 노드에 `crudui-node--framed`가 붙습니다 |
| `lang-item` | 언어 코드를 담은 `__label` | 위젯 |

본문에 레이블 대상 컨트롤이 정확히 하나이면 레이블은 그 컨트롤을 가리키는 `label`
요소이고, 아니면 `span`입니다. 체크박스와 스위처 캡션은 본문 안 입력 자신의
레이블이며 헤더에는 설명만 둡니다. `hidden` 필드에는 헤더가 없습니다. `language: 'en'`으로 출력한 행은 다음과 같습니다.

```html
<div class="crudui-node crudui-node--row" data-crudui-row-key="__0000000000001__">
  <div class="crudui-node__header">
    <button type="button" class="crudui-action" data-crudui-action="toggle-row"
      aria-expanded="true" aria-controls="crudui:companies.__0000000000001__:body" aria-label="Expand or collapse"></button>
    <span class="crudui-node__label">Company</span>
    <span class="crudui-node__number">1</span>
    <span class="crudui-node__title">ACME</span>
    <span class="crudui-node__summary" hidden="">Nested rows: 2</span>
    <div class="crudui-controls" role="group" aria-label="Row controls">…</div>
  </div>
  <div class="crudui-node__body" id="crudui:companies.__0000000000001__:body">…</div>
</div>
```

## 행

- 번호는 상위 행들의 1부터 시작하는 위치를 `.`으로 연결합니다.
- `multiple.title`은 값이 행 제목이 되는 직속 자식을 지정합니다. 값이 비어 있으면
  이름 없음 문구를 표시합니다.
- group 행은 접을 수 있습니다. 요약은 행 본문에 직접 있는 컬렉션들의 행 수 합계를
  표시하고, 컬렉션이 없으면 접힘 문구를 표시합니다. 스칼라 행에는 토글, 제목, 요약이
  없습니다.
- 컨트롤 순서는 `move-up`·`move-down`(`multiple.sortable`), `add-row`,
  `copy-row`(`multiple.copy`), `remove-row`입니다. 첫 행의 `move-up`과 마지막 행의
  `move-down`은 사용할 수 없습니다. 행 수가 `multiple.max`에 도달하면 `add-row`와
  `copy-row`를, `multiple.min` 이하이면 `remove-row`를 사용할 수 없습니다.
- 폼과 구조 맵의 모든 조작 버튼(`data-crudui-action`)은 사용할 수 없는 조작을
  `disabled`가 아니라 `aria-disabled="true"`로 표시합니다. 버튼은 포커스를 받을 수 있고
  클릭해도 아무 일도 하지 않습니다. 포커스된 컨트롤이 비활성화되면 Chromium은 포커스를
  유지하고 WebKit은 해제하므로, `disabled`를 쓰면 포커스가 브라우저와 렌더링 시점에 따라
  달라집니다. 필드 컨트롤의 `disabled`는 선언된 데이터 상태이며 제출에서 제외되므로 그대로
  씁니다.
- `multiple.controls`는 행 컨트롤을 행 `header`(기본) 또는 `footer`에 둡니다.
  `outline`이면 행 컨트롤은 구조 맵 줄로 옮겨집니다. 빈 컬렉션의 추가 컨트롤은 행
  컨트롤이 아니므로 컬렉션 푸터에 남습니다.
- `multiple.header: sticky`는 `crudui-node--sticky`를 추가하고, 행 루트 스타일이
  `--crudui-sticky-depth`를 상위 고정 행의 수로 설정합니다. 행의 고정선은 그 수에
  `--crudui-node-header-height`를 곱한 값입니다. 고정 행은 CSS만으로 동작하므로 폼이
  스크롤되는 곳이 페이지, 프레임, 스크롤 박스 어디든 같게 동작합니다. 헤더는 고정선에
  고정되고 테두리를 포함해 정확히 헤더 높이이며 줄바꿈하지 않으므로(긴 제목은 줄임표) 고정된
  단계가 겹치지 않고 맞닿습니다. 단계 레이블은 `scroll-state(stuck: top)` 컨테이너 쿼리로
  헤더가 고정된 동안에만 보입니다. 고정 행 안의 컨트롤은 그 위에 고정되는 헤더만큼의 위쪽
  스크롤 여백(`--crudui-sticky-cover`, 고정선에 헤더 높이 하나를 더한 값)을, 모든 폼 컨트롤은
  푸터 높이만큼의 아래쪽 스크롤 여백을 가지므로 컨트롤에 포커스하면 이들에 가리지 않게
  스크롤됩니다. 스크롤하는 동안 행을 측정하거나 표시하는 스크립트는 없습니다.

## 폼 버튼

스펙은 루트의 `buttons`로 폼 버튼을 선언합니다. `buttons`는 `{ type, text, name, value,
href, design, behavior }` 목록이고 `type`은 `submit`, `reset`, `button`, `link` 중 하나입니다.
`buttons`가 없는 스펙은 제출 버튼 하나를 가집니다. `text`가 없는 제출·초기화 버튼은 유형의
인터페이스 문구를 표시하고, button과 link는 `text`가, link는 `href`가 필요합니다.
`action`(`method`, `url`, `enctype`)은 제출 대상이며 애플리케이션을 위해 템플릿에 보존합니다.
두 키는 폼 루트에 속합니다.

모든 폼은 `crudui-form__footer`로 끝나며, 폼 작업 문구를 접근 가능한 이름으로 가진
`crudui-controls` 그룹 하나를 담습니다. `bindButtons(template, data, options)`가 버튼을
평가하고(디자인 클래스와 스타일은 필드 디자인 규칙을 따름), `formButtonsHtml(buttons)`가 유일한
마크업 생성기입니다. link는 `a`, 나머지 유형은 `button` 요소이며 속성 순서는 `type`, `class`,
`style`, `name`, `value`, `href`, `onclick`입니다. 푸터는 고정 행 헤더가 위에 붙듯 스크롤 영역
하단에 `--crudui-form-footer-height` 높이로 붙습니다.

## 구조 맵과 현재 데이터 보기

구조 맵의 규칙은 하나입니다. 맵의 한 줄은 폼의 행 하나입니다. `buildOutline(nodes)`은
폼의 행과 각 행에 중첩된 행을 반환하므로 맵은 폼과 똑같이 중첩되며, 컬렉션·개수·빈
컬렉션은 행이 아니므로 폼에만 남습니다. 각 행은 번호와 제목을 담은 `select-row` 버튼을
가집니다. 중첩된 행 본문은
한 단계 들여씁니다. 헤더에는 `expand-all`,
`collapse-all`, `undo`(되돌릴 이력이 없으면 사용할 수 없음)를 둡니다. React, Vue, Svelte는
`Outline`과 `DataView`를, `bindForm`으로 데이터를 직접 관리하는 응용 프로그램에는
상태 없는 `OutlineView`와 `DataPanel`(Vue: `outlineVNode`, `dataVNode`)을, HTML 렌더러는 `renderOutline(form)`과 `renderData(form)`, 같은 애플리케이션용
`renderOutlineView(state, messages)`와 `renderDataPanel(data, messages)`를 제공합니다.
네 렌더러 모두 공유 [구조 맵 사례](../../tests/fixtures/form-outline/cases.json)를 재현합니다. `connectForm`은 폼 안의 작업을 실행합니다.
`connectOutline(element, form, formElement)`는 구조 맵의 작업을 실행하고, `select-row`
버튼이 가리키는 폼 행의 첫 컨트롤에 포커스하며, 브라우저가 그 컨트롤을 보이게 스크롤합니다.

## 화면 문구

컨트롤 레이블, 개수, 요약은 `ko`, `en`, `ja`, `zh` 문구 표 하나에서 가져옵니다
([`messages.ts`](../../packages/generator-core/src/messages.ts)). 모든 구현이 같은
문구를 사용합니다. 바인딩은 문자열이 아닌 언어를 `Language must be a string`으로,
그다음 문자열이 아닌 `keyPrefix`·`idPrefix`를 `{name} must be a string`으로, 그다음
`throw`나 `marker`가 아닌 `unsupported`를 `unsupported must be throw or marker`로,
그다음 그 밖의 언어를 `Unsupported language: {language}`로 거부합니다. 없거나 null인
옵션은 기본값을 씁니다.

## 스타일

`@crudui/generator-core/crudui.css`는 폼에 필요한 유일한 스타일시트로 슬롯 배치, 행 카드,
위젯, 컨트롤 아이콘, 고정 헤더, 구조 맵, 현재 데이터 보기를 정의합니다. box-sizing과
`[hidden]` 요소 숨김을 포함한 모든 규칙은 crudui 블록 범위 안에 있으며 페이지 스타일이나 CSS
프레임워크에 기대지 않습니다. 페이지는 자기 레이아웃만 스타일링하고 crudui 블록 안은 건드리지
않습니다. 폼, 구조 맵, 현재 데이터 보기는 `--crudui-*` 사용자 정의 속성 한 벌을 공유합니다.

## 목록·상세 마크업

표시 결과도 폼 결과와 같은 블록·요소·수식자 문법을 사용합니다. 목록 루트는
`crudui-list`이고 표, 제목, 셀, 카드, 빈 상태, 동작과 페이지 이동은 각각
`crudui-list__table`, `crudui-list__heading`, `crudui-list__cell`,
`crudui-list__cards`, `crudui-list__card`, `crudui-list__empty`,
`crudui-list__actions`, `crudui-list__action`, `crudui-list__pagination`을
사용합니다. 상세 루트는 `crudui-detail`이고 필드마다
`crudui-detail__field`, `crudui-detail__label`, `crudui-detail__value`를
사용합니다.

표시 값은 모두 `crudui-value`와 닫힌 형식 수식자
`crudui-value--text`, `--date`, `--number`, `--choice-label`, `--badge`,
`--link`, `--bool`, `--image`, `--html`을 함께 가집니다. 배지 변형은 클래스명이
아닌 데이터이므로 변형이 있으면 `crudui-badge`에
`data-crudui-variant`를 기록합니다. 불리언 표시는 `crudui-bool`과 닫힌
`--text`, `--check`, `--icon` 수식자를 사용하고
`data-crudui-state="true|false"`를 기록합니다. CSS는 이 속성을 스타일링할 수
있으며 스크립트는 표시 클래스로 동작을 추론하지 않고 선언된 데이터와 ARIA
속성을 읽습니다.

## 기준 폼에서 채택하지 않은 동작

이 문법의 기준이 된 폼과 다음을 의도적으로 다르게 정했습니다.

1. 준비 폴링과 시간 기반 스크롤 잠금 대신 렌더링 후 동기화를 사용합니다. 고정 헤더의
   고정 상태는 scroll과 resize 이벤트에서 애니메이션 프레임당 최대 한 번 측정하며, 행
   높이와 관계없이 동작합니다.
2. 펼침 상태는 레코드 데이터가 아닌 뷰 상태입니다.
3. 행은 배열 위치가 아닌 키로 식별합니다.
4. 깊이에 제한이 없으며 깊이별 컴포넌트 대신 재귀 노드 하나를 사용합니다.
5. `multiple.max`를 적용합니다.
6. 되돌리기는 모든 데이터 변경을 기록하며 같은 경로의 연속 입력을 병합합니다.
7. 고정 헤더와 레이블은 CSS만으로 동작합니다. 스크롤 위치를 따르는 스크립트가 없으므로
   스크롤하는 동안 아무것도 실행하거나 렌더링하지 않습니다.
8. 행에는 번호 하나만 표시하며 별도 위치 표기는 없습니다.
9. 배치 옵션은 설정 패널이 아닌 명세에 선언합니다.
