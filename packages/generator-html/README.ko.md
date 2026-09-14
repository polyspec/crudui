# @crudui/generator-html

[English](README.md).

CRUDUI 폼 인스턴스와 목록·상세를 프레임워크 없이 HTML로 렌더링합니다.

```ts
import { compileForm, createForm } from '@crudui/generator-core';
import { renderForm } from '@crudui/generator-html';

const template = compileForm({ type: 'group', properties: { name: { type: 'text' } } });
const form = createForm(template, { name: 'Example' });
const html = renderForm(form);
```

renderer는 평가된 core 모델을 소비하고 HTML fragment를 반환합니다. 외부 `form`
요소를 만들거나 브라우저 이벤트를 연결하거나 데이터를 검증하거나 레코드를
로드하지 않습니다. 브라우저 편집이 필요하면 fragment를 삽입한 뒤
`@crudui/generator-core`의 `connectForm`을 사용합니다.

`bindForm`으로 데이터를 직접 관리하는 애플리케이션은
`renderFormView(bindForm(template, data, options), bindButtons(template, data, options), formMessages(language))`로
같은 마크업을, `renderOutlineView`와 `renderDataPanel`로 구조 맵과 데이터 보기를 렌더링합니다.

`renderList(spec, rows, { layout: 'table' | 'card' })`는 평가된 목록을 렌더링합니다.
`renderDetail(spec, record)`는 전달한 레코드 하나를 읽기 전용 상세로 렌더링합니다.

- [런타임 계약](../../docs/spec/form-runtime.ko.md)
- [폼 작업](../../docs/operations/forms.ko.md)
