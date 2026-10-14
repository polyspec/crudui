# @polyspec/crudui-generator-svelte
<!-- doc-id: packages-generator-svelte-readme -->
<!-- source-sha256: 7c8e4956b139cf5e227f20cde5458c903c274b54d13c2e73e0bc6b5f8bdf75c0 -->

[English](README.md).

Svelte에서 폼 인스턴스, 목록, 상세를 렌더링합니다.

```ts
import { compileForm, createForm } from '@polyspec/crudui-generator-core';
import { renderForm, renderList } from '@polyspec/crudui-generator-svelte';

const template = compileForm({
  type: 'group', properties: { name: { type: 'text' } },
});
const form = createForm(template, { name: 'Example' });
const formHtml = renderForm(form);

const listSpec = { columns: { name: { field: 'name', label: 'Name' } } };
const listHtml = renderList(listSpec, [{ name: 'Ada' }], { language: 'en' });
```

`Form`에 `form` 속성을 전달하여 렌더링합니다. 공유 템플릿마다 한 번 컴파일하고 폼마다 폼 인스턴스를
생성합니다. `renderForm(form, options)`은 서버 렌더링용으로 같은 마크업을 문자열로 반환합니다.
`options`는 이를 [완전한 폼](../../docs/spec/form-runtime.ko.md#완전한-폼)으로 만들며 `Form`도 같은 `options` 속성을 받습니다.

`List`는 `vm`과 `layout` 속성을, `Detail`은 `vm` 속성을 받으며, 모델은
`@polyspec/crudui-generator-core`의 `buildList(spec, rows, options)`와 `buildDetail(spec, record, options)`로 만듭니다.
`renderList(spec, rows, options)`와 `renderDetail(spec, record, options)`는 문자열을 반환합니다.

패키지 진입점은 컴포넌트(`Form`, `List`, `Detail`, `Node`, `Controls`, `Widget`, `Outline`,
`OutlineView`, `DataView`, `DataPanel`)와 렌더 함수 `renderForm`, `renderList`, `renderDetail`을
내보냅니다. 컴파일, 폼 인스턴스, 모델과 오류 클래스는 `@polyspec/crudui-generator-core`에서 가져오며
이 패키지는 이를 다시 내보내지 않습니다.
각 컴포넌트는 props 타입 `XProps`(`FormProps`, `ListProps` 등)를 이름으로 내보내는 Svelte 5 `Component<XProps>`이며,
컴포넌트 instance의 타입은 `ReturnType<typeof X>`입니다.

이 패키지는 `svelte` 내보내기 조건으로 Svelte 컴포넌트를 배포합니다. 서버에서도
`@sveltejs/vite-plugin-svelte`를 쓰는 Vite 같은 Svelte 인식 번들러로 불러옵니다(예: `ssrLoadModule`).
일반 Node에서는 직접 불러올 수 없습니다.

- [런타임 계약](../../docs/spec/form-runtime.ko.md)
- [폼 운영](../../docs/operations/forms.ko.md)
- [목록과 상세 운영](../../docs/operations/displays.ko.md)
- [기능 상태](../../docs/features.ko.md)

저장소 루트에서 `npm run test:forms`로 모든 어댑터를 빌드하고 테스트합니다.
