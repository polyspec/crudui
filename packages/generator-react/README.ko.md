# @crudui/generator-react

[English](README.md).

React에서 폼 인스턴스, 목록, 상세를 렌더링합니다.

```tsx
import { buildList, compileForm, createForm, Form, List, renderForm, renderList } from '@crudui/generator-react';

const template = compileForm({
  type: 'group', properties: { name: { type: 'text' } },
});
const form = createForm(template, { name: 'Example' });
const formHtml = renderForm(form);
const element = <Form form={form} />;

const listSpec = { columns: { name: { field: '.name', label: 'Name' } } };
const rows = [{ name: 'Ada' }];
const listHtml = renderList(listSpec, rows, { language: 'en' });
const list = <List vm={buildList(listSpec, rows, { language: 'en' })} layout="table" />;
```

`Form`에 `form` 속성을 전달하여 렌더링합니다. 공유 템플릿마다 한 번 컴파일하고 폼마다 폼 인스턴스를
생성합니다. `renderForm(form)`은 서버 렌더링용으로 같은 마크업을 문자열로 반환합니다.

`List`와 `Detail`은 다시 내보낸 `buildList(spec, rows, options)`와
`buildDetail(spec, record, options)`로 만든 모델을 렌더링합니다. `renderList(spec, rows, options)`와
`renderDetail(spec, record, options)`는 문자열을 반환합니다.

- [런타임 계약](../../docs/spec/form-runtime.ko.md)
- [폼 운영](../../docs/operations/forms.ko.md)
- [목록과 상세 운영](../../docs/operations/displays.ko.md)
- [기능 상태](../../docs/features.ko.md)

저장소 루트에서 `npm run test:forms`로 모든 어댑터를 빌드하고 테스트합니다.
