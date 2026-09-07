# @crudui/generator-core

[English](README.md).

프레임워크에 의존하지 않는 폼 컴파일, 편집 세션, 목록 평가를 제공합니다.

```ts
import { compileForm, createFormSession } from '@crudui/generator-core';

const template = compileForm({
  type: 'group', properties: { name: { type: 'text' } },
});
const session = createFormSession(template);
session.setData({ name: 'Example' });
```

공유 템플릿마다 한 번 컴파일하고 폼 인스턴스마다 세션을 생성합니다.
편집 세션 없이 필드를 평가하려면 `bindForm(template, data)`를 사용합니다.

- [런타임 계약](../../docs/spec/form-runtime.ko.md)
- [설치, 중첩 행, 검증](../../docs/operations/forms.ko.md)
- [기능 상태](../../docs/features.ko.md)

저장소 루트에서 `npm run test:forms`로 모든 어댑터를 빌드하고 테스트합니다.
