# @polyspec/crudui-generator-vue
<!-- doc-id: packages-generator-vue-readme -->
<!-- source-sha256: 8515330837081817460b79ee7fc66d3aeccfed71a40b7415fb2e1cfcbb4dabac -->

[English](README.md).

Vue에서 폼 인스턴스, 목록, 상세를 렌더링합니다.

```ts
import { h } from 'vue';
import { buildList, compileForm, createForm } from '@polyspec/crudui-generator-core';
import { Form, List, renderForm, renderList } from '@polyspec/crudui-generator-vue';

const template = compileForm({
  type: 'group', properties: { name: { type: 'text' } },
});
const form = createForm(template, { name: 'Example' });
const formHtml = await renderForm(form);
const vnode = h(Form, { form });

const listSpec = { columns: { name: { field: 'name', label: 'Name' } } };
const rows = [{ name: 'Ada' }];
const listHtml = await renderList(listSpec, rows, { language: 'en' });
const list = List(buildList(listSpec, rows, { language: 'en' }), 'table');
```

`Form`에 `form` 속성을 전달하여 렌더링합니다. 공유 템플릿마다 한 번 컴파일하고 폼마다 폼 인스턴스를
생성합니다. `renderForm(form, options)`은 서버 렌더링용으로 같은 마크업을 담은 프로미스를 반환합니다.
`options`는 이를 [완전한 폼](../../docs/spec/form-runtime.ko.md#완전한-폼)으로 만들며 `Form`도 같은 `options` 속성을 받습니다.

`List(vm, layout)`와 `Detail(vm)`은 `@polyspec/crudui-generator-core`의 `buildList(spec, rows, options)`와
`buildDetail(spec, record, options)`로 만든 모델의 VNode를 반환합니다.
`renderList(spec, rows, options)`와 `renderDetail(spec, record, options)`는 문자열 프로미스를
반환합니다. 서버 렌더링은 `vue` 피어 의존성이 제공하는 `vue/server-renderer`를 사용합니다.

패키지 진입점은 컴포넌트와 렌더 함수(`Form`, `List`, `Detail`, `Widget`, `Outline`, `DataView`,
`nodeVNode`, `controlsVNode`, `outlineVNode`, `dataVNode`), 그리고 `renderForm`, `renderList`,
`renderDetail`을 내보냅니다. 컴파일, 폼 인스턴스, 모델과 오류 클래스는
`@polyspec/crudui-generator-core`에서 가져오며 이 패키지는 이를 다시 내보내지 않습니다.

- [런타임 계약](../../docs/spec/form-runtime.ko.md)
- [폼 운영](../../docs/operations/forms.ko.md)
- [목록과 상세 운영](../../docs/operations/displays.ko.md)
- [기능 상태](../../docs/features.ko.md)

저장소 루트에서 `npm run test:forms`로 모든 어댑터를 빌드하고 테스트합니다.

## 프레임워크 화면

- 각 프레임워크 화면을 데이터 로드 전에 마운트하고 데이터를 주입·교체합니다.

- 포인터와 키보드로 행 작업을 실행하고 React, Vue, Svelte에서 포커스를 받은 행을
  확인합니다.

- 프레임워크 렌더링 사이에 연속 기본 입력 이벤트를 전송하고, 각 편집값을 유지하며
  마지막 입력값과 인스턴스 값이 일치하는지 확인합니다.
