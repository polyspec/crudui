# @crudui/form-binding

[English](README.md).

서버가 렌더링한 CRUDUI 폼을 서버가 검증할 때 쓰는 스펙으로 브라우저에서 검증합니다. 이 패키지는
브라우저에서만 실행되며 `@crudui/validator`에 의존합니다.

```ts
import { bindForm } from '@crudui/form-binding';

const spec = JSON.parse(document.querySelector('#member-spec')!.textContent!);
const binding = bindForm(document.querySelector('form')!, spec, { keyPrefix: 'form' });
```

`bindForm(form, spec, options)`는 `renderForm`이 `options.action`으로 쓴 완전한 폼 하나를 담고 파싱이
끝난 `form` 요소를 연결합니다. 네이티브 제출이 보내는 대로 폼 컨트롤에서 데이터를 만들고, 바뀐 필드를
컨트롤이 포커스를 잃을 때와 그 뒤의 모든 변경에서 검증하며, 제출할 때 폼 전체를 검증합니다. 같은
오류에 대해 `renderForm`이 쓰는 오류 마크업을 쓰고, 오류가 있는 필드의 컨트롤에 `aria-invalid`를
설정하며, htmx 같은 다른 `submit` 리스너가 받기 전에 유효하지 않은 제출을 취소합니다.
`options.keyPrefix`는 컴파일한 템플릿의 키 접두사이고, `options.message(error)`는 오류의 문구를,
`options.formErrors(result)`는 폼 오류를 반환합니다. 반환한 객체에는 폼 전체를 검증하고 결과를
반환하는 `validate()`와 `dispose()`가 있습니다.

서버는 모든 제출을 검증합니다. 바인딩은 요청을 보내기 전에 오류를 보여 줍니다.

- [브라우저 검증 계약](../../docs/spec/form-runtime.ko.md#브라우저-검증)
- [검증 절차](../../docs/operations/validation.ko.md#브라우저-검증)
