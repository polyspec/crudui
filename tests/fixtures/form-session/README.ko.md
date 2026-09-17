# 폼 세션 시나리오

[English](README.md).

이 묶음은 `cases.json` 대신 공유 모듈을 담습니다. 각 프레임워크 검사는 직접 폼을 마운트하고 `expect`,
렌더링을 기다리는 `flush` 함수와 함께 넘깁니다.

- [`scenario.mjs`](scenario.mjs)는 중첩 반복 폼 `spec`, 그 `data`, 행 키 `companyKey`, `storeKey`,
  `otherStoreKey`, `storesPath`, `exerciseSessionDom`을 내보냅니다. 회사 키와 한 매장 키는 일부러 같게
  두었으므로 교체는 경로 단위로 이루어져야 합니다. `exerciseSessionDom`은 마운트한 폼에 데이터를 넣고
  기본값 위의 빈 값, 날짜로 표시하는 날짜 시간, 편집, 행 추가·삭제·복사·이동과 각 동작 뒤의 포커스,
  `aria-disabled`를 가진 사용할 수 없는 동작, `aria-controls`를 통한 행 접기와 펼치기, 실행 취소, 행 키
  변경, 체크박스 조건으로 숨는 필드, 편집한 컨트롤 위에 넣는 레코드, 마지막 행을 삭제한 뒤와 빈 컬렉션에
  행을 추가한 뒤의 포커스를 확인합니다.
- [`controls.mjs`](controls.mjs)는 `controlSpec`과 `exerciseControls`를 내보내며, 라벨 대상, 다중 선택
  배열, 네이티브 `FormData`, 레코드 복원, 요소 ID의 고유성을 확인합니다.
- [`initialization.mjs`](initialization.mjs)는 `compareServerTakeover`와 `compareInitialization`을
  내보냅니다.
- [`data-rows.mjs`](data-rows.mjs)는 `onlySpec`, `onlyData`, `exerciseOnlyRows`를 내보냅니다.
  `exerciseOnlyRows`는 데이터가 없는 `multiple: only` 컬렉션에 행과 행 컨트롤이 없고, `setData` 뒤에는
  데이터의 행만 그 키로 가지며, `addRow`, `copyRow`, `removeRow`, `moveRow`, `rekeyRow`가 데이터와
  화면을 바꾸지 않고 `INVALID_FORM_INPUT`과 `Rows of variants come only from data`로 실패하는지
  확인합니다. 또한 `visibilitySpec`, `visibilityData`, `exerciseHiddenValues`를 내보냅니다.
  `exerciseHiddenValues`는 `design.show`가 읽는 체크박스를 눌러 그룹을 숨기고 다시 보이며, 숨긴 동안
  설정한 값을 포함해 그룹의 값이 컨트롤과 `getData()`에 남는지 확인합니다.

## 비교

시나리오와 컨트롤 확인은 프레임워크 검사가 넘긴 `expect`로 단언합니다. `compareServerTakeover`는 HTML
렌더러의 `renderForm`으로 세션을 렌더링하고, 주석·빈 텍스트 노드·속성 순서를 무시하며 `style` 속성은 CSS
객체 모델이 직렬화한 형태로 비교해 프레임워크 폼과 파싱한 DOM이 같기를 요구합니다.
`compareInitialization`은 데이터와 함께 만든 폼과, 마운트한 뒤 `setData`로 같은 데이터를 세 번 받은 폼을
비교합니다. 비교 대상은 직렬화한 HTML을 제외한 [폼 검사기](../../form-inspector/form-snapshot.mjs)의 상태,
`getData()`의 JSON, 변하지 않은 `template`입니다. 이어서 두 폼에서 값을 바꿨다가 되돌리고, 상태가 같으며
체크박스 요소가 그대로이기를 요구합니다.

[React](../../../packages/generator-react/src/__tests__/Form.test.tsx),
[Vue](../../../packages/generator-vue/test/form-session.test.mjs),
[Svelte](../../../packages/generator-svelte/test/form-session.client.mjs) 폼 검사와
[HTML 렌더러 세션 검사](../../../packages/generator-html/src/form-session.test.ts)가 네 모듈을 모두
사용합니다. [코어 폼 검사](../../../packages/generator-core/src/form.test.ts)는 시나리오의 `spec`,
`data`, 행 키, `storesPath`를 사용합니다.

## 재생성

생성기는 없으며 모듈은 직접 작성합니다. 변경은 모든 프레임워크에 한 번에 적용됩니다. `spec`과 `data`는
단언과 일치해야 하고, 프레임워크 검사가 넘기는 인자(`element`, `session` 또는 `form`, `expect`,
`flush`)와 코어 폼 검사가 가져오는 내보내기를 유지해야 합니다.
