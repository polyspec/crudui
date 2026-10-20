# @polyspec/crudui-generator-react
<!-- doc-id: packages-generator-react-readme -->
<!-- source-sha256: dbf553ecd3a5596682abf9e1998b167232170ab562202e3fc32e9bd30735ff36 -->

[English](README.md).

React에서 폼 인스턴스, 목록, 상세를 렌더링합니다.

```tsx
import { buildList, compileForm, createForm } from '@polyspec/crudui-generator-core';
import { Form, List } from '@polyspec/crudui-generator-react';
import { renderForm, renderList } from '@polyspec/crudui-generator-react/server';

const template = compileForm({
  type: 'group', properties: { name: { type: 'text' } },
});
const form = createForm(template, { name: 'Example' });
const formHtml = renderForm(form);
const element = <Form form={form} />;

const listSpec = { columns: { name: { field: 'name', label: 'Name' } } };
const rows = [{ name: 'Ada' }];
const listHtml = renderList(listSpec, rows, { language: 'en' });
const list = <List vm={buildList(listSpec, rows, { language: 'en' })} layout="table" />;
```

`Form`에 `form` 속성을 전달하여 렌더링합니다. 공유 템플릿마다 한 번 컴파일하고 폼마다 폼 인스턴스를
생성합니다. `renderForm(form, options)`은 서버 렌더링용으로 같은 마크업을 문자열로 반환합니다.
`options`는 이를 [완전한 폼](../../docs/spec/form-runtime.ko.md#완전한-폼)으로 만들며 `Form`도 같은 `options` 속성을 받습니다.

`List`와 `Detail`은 `@polyspec/crudui-generator-core`의 `buildList(spec, rows, options)`와
`buildDetail(spec, record, options)`로 만든 모델을 렌더링합니다. `renderList(spec, rows, options)`와
`renderDetail(spec, record, options)`는 문자열을 반환합니다.

컴포넌트 진입점은 `Form`, `List`, `Detail`, `Cell`, `Node`, `Controls`, `Widget`,
`Outline`, `OutlineView`, `DataView`, `DataPanel`을 내보냅니다. 서버 진입점은
`renderForm`, `renderList`, `renderDetail`을 내보냅니다. 컴파일, 폼 인스턴스, 모델과 오류 클래스는
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
