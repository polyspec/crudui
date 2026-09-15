# @crudui/generator-svelte

[English](README.md).

Svelte에서 폼 인스턴스, 목록, 상세를 렌더링합니다.

```ts
import { compileForm, createForm, renderForm, renderList } from '@crudui/generator-svelte';

const template = compileForm({
  type: 'group', properties: { name: { type: 'text' } },
});
const form = createForm(template, { name: 'Example' });
const formHtml = renderForm(form);

const listSpec = { columns: { name: { field: '.name', label: 'Name' } } };
const listHtml = renderList(listSpec, [{ name: 'Ada' }], { language: 'en' });
```

`Form`에 `form` 속성을 전달하여 렌더링합니다. 공유 템플릿마다 한 번 컴파일하고 폼마다 폼 인스턴스를
생성합니다. `renderForm(form)`은 서버 렌더링용으로 같은 마크업을 문자열로 반환합니다.

`List`는 `vm`과 `layout` 속성을, `Detail`은 `vm` 속성을 받으며, 모델은 다시 내보낸
`buildList(spec, rows, options)`와 `buildDetail(spec, record, options)`로 만듭니다.
`renderList(spec, rows, options)`와 `renderDetail(spec, record, options)`는 문자열을 반환합니다.

이 패키지는 `svelte` 내보내기 조건으로 Svelte 컴포넌트를 배포합니다. 서버에서도
`@sveltejs/vite-plugin-svelte`를 쓰는 Vite 같은 Svelte 인식 번들러로 불러옵니다(예: `ssrLoadModule`).
일반 Node에서는 직접 불러올 수 없습니다.

- [런타임 계약](../../docs/spec/form-runtime.ko.md)
- [폼 운영](../../docs/operations/forms.ko.md)
- [목록과 상세 운영](../../docs/operations/displays.ko.md)
- [기능 상태](../../docs/features.ko.md)

저장소 루트에서 `npm run test:forms`로 모든 어댑터를 빌드하고 테스트합니다.
