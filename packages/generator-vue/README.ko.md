# @polyspec/generator-vue

[English](README.md).

Vue에서 준비된 폼 템플릿과 편집 세션을 렌더링합니다.

```ts
import { compileForm, createFormSession, FormSessionView } from '@polyspec/generator-vue';

const template = compileForm({
  type: 'group', properties: { name: { type: 'text' } },
});
const session = createFormSession(template);
session.setData({ name: 'Example' });
```

`FormSessionView`에 `session` 속성을 전달하여 렌더링합니다. 공유 템플릿마다 한 번 컴파일하고 폼 인스턴스마다 세션을 생성합니다.
편집 세션 없이 필드를 평가하려면 `bindForm(template, data)`를 사용합니다.

- [런타임 계약](../../docs/spec/form-runtime.ko.md)
- [설치, 중첩 행, 검증](../../docs/operations/forms.ko.md)
- [기능 상태](../../docs/features.ko.md)

저장소 루트에서 `npm run test:forms`로 모든 어댑터를 빌드하고 테스트합니다.
