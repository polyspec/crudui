# @polyspec/crudui-generator-html
<!-- doc-id: packages-generator-html-readme -->
<!-- source-sha256: 57e07bf8c58a40e74ee68529bd63cd5e702e0db8b7131cfa00ff43ce62376a8b -->

[English](README.md).

CRUDUI 폼 인스턴스와 목록·상세를 프레임워크 없이 HTML로 렌더링합니다.

```ts
import { compileForm, createForm } from '@polyspec/crudui-generator-core';
import { renderForm } from '@polyspec/crudui-generator-html';

const template = compileForm({ type: 'group', properties: { name: { type: 'text' } } });
const form = createForm(template, { name: 'Example' });
const html = renderForm(form);
```

renderer는 평가된 core 모델을 소비하고 HTML을 반환합니다. `renderForm(form, options)`은
[완전한 폼](../../docs/spec/form-runtime.ko.md#완전한-폼)을 씁니다. `options.action`이 있으면 `form` 요소와
`options.hidden` input을 만들고 `options.formErrors`와 `options.errors`를 배치합니다. 옵션이 없으면
`crudui-form` 블록을 반환합니다. 브라우저 이벤트를 연결하거나 데이터를 검증하거나 레코드를 로드하지
않습니다. 브라우저 편집이 필요하면 마크업을 삽입한 뒤 `crudui-form` 요소에
`@polyspec/crudui-generator-core`의 `connectForm`을 사용합니다.

데이터를 `bindForm`으로 직접 관리할 때는
`renderFormView(bindForm(template, data, options), bindButtons(template, data, options), formMessages(language), renderOptions, formDescription(template, options))`로
같은 마크업을, `renderOutlineView`와 `renderDataPanel`로 구조 맵과 데이터 보기를 렌더링합니다.

`renderList(spec, rows, { layout: 'table' | 'card' })`는 평가된 목록을 렌더링합니다.
`renderDetail(spec, record)`는 전달한 레코드 하나를 읽기 전용 상세로 렌더링합니다.
`renderOutline(form)`과 `renderData(form)`는 폼 인스턴스의 구조 맵과 데이터 보기를 렌더링합니다.
패키지 진입점은 이 여덟 렌더 함수입니다.

- [런타임 계약](../../docs/spec/form-runtime.ko.md)
- [폼 작업](../../docs/operations/forms.ko.md)
