# @crudui/generator-core

[English](README.md).

프레임워크에 의존하지 않는 폼 컴파일, 편집 세션, 목록 평가를 제공합니다.

```ts
import { compileForm, createForm } from '@crudui/generator-core';

const template = compileForm({
  type: 'group', properties: { name: { type: 'text' } },
});
const session = createForm(template);
session.setData({ name: 'Example' });
```

공유 템플릿마다 한 번 컴파일하고 폼 인스턴스마다 세션을 생성합니다.
편집 세션 없이 필드를 평가하려면 `bindForm(template, data)`를 사용합니다.

패키지 진입점은 애플리케이션 API입니다. 폼 컴파일과 바인딩(`compileForm`, `bindForm`,
`bindButtons`, `formButtonsHtml`), 폼 인스턴스(`createForm`, `FormInstance`, `createRowKey`,
`sequenceRowKey`, `formMessages`), 보기 상태와 이력 함수, 목록·상세·구조 맵 모델(`buildList`,
`buildDetail`, `buildOutline`), 브라우저 연결(`connectForm`, `connectOutline`,
`connectStickyHeaders`, `patchContent`, `resolveAction`, `runAction`), 애플리케이션이 처리하는
오류(`ComposeLoadError`, `FormInputError`, `UnsupportedFieldTypeError`)를 내보냅니다. 스타일시트는
`@crudui/generator-core/crudui.css`입니다.

`@crudui/generator-core/internal`은 CRUDUI 렌더러 패키지가 공유하는 도우미입니다. 애플리케이션용으로
지원하지 않으며 렌더러와 함께 바뀝니다.

- [런타임 계약](../../docs/spec/form-runtime.ko.md)
- [설치, 중첩 행, 검증](../../docs/operations/forms.ko.md)
- [기능 상태](../../docs/features.ko.md)

저장소 루트에서 `npm run test:forms`로 모든 어댑터를 빌드하고 테스트합니다.
