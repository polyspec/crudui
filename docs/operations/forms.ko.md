# 폼 개발과 검증

[English](forms.md). 계약은 [폼 런타임](../spec/form-runtime.ko.md)에 정의합니다.

## 설치

저장소 루트에서 명령을 실행합니다. Node.js와 npm을 설치한 후 실행합니다.

```sh
npm ci
npm run build
```

4개 언어 검증에는 Composer 의존성을 설치한 PHP, Go, Rust가 필요합니다.
`packages/validator-php`에서 `composer install`로 PHP 의존성을 설치합니다.
로컬에 이 도구들이 있으면 컨테이너는 필요하지 않습니다.

## 데이터 로드 전 구성

```tsx
import {
  compileForm, createFormSession, FormSessionView, sequenceRowKey,
} from '@polyspec/generator-react';

const template = compileForm({
  type: 'group',
  properties: {
    stores: {
      type: 'group', multiple: { copy: true, sortable: true },
      properties: { name: { type: 'text', validate: { required: true } } },
    },
  },
}, { keyPrefix: 'form' });
const cached = JSON.stringify(template);
const session = createFormSession(JSON.parse(cached));

function StoreForm() {
  return <FormSessionView session={session} />;
}

session.setData({ stores: { [sequenceRowKey(42)]: { name: 'Store' } } });
const copied = session.copyRow('stores', sequenceRowKey(42));
session.rekeyRow('stores', copied, sequenceRowKey(43));
const submission = session.getData();
```

공유 캐시에는 템플릿을 저장하고 폼 인스턴스마다 세션을 생성합니다.
레코드 로드가 완료되면 `setData`를 호출합니다. Vue와 Svelte에서도
`FormSessionView`에 `session` 속성을 전달합니다. 프레임워크 패키지는 동일한 코어
함수를 제공합니다. SSR 함수에는 컴파일된 템플릿과 `{ data, language }`를 전달합니다.
저장소의 SSR 함수는 React와 Svelte의 `src/v2/index.ts`에 있는 `renderFormV2`,
Vue의 `src/v2/ssr.ts`에 있는 `renderFormV2SSR`입니다. 이 소스 함수는 패키지 하위
경로로 내보내지 않습니다. `$ref` 파일은 렌더링 전에 컴파일합니다.

`@polyspec/validator`의 `ValidatorV2`와 원본 명세로 `submission`을 검증합니다.
서버가 저장된 seq를 생성하면 해당 컬렉션 경로의 키를 변경합니다.
데이터 객체 전체에서 토큰을 치환하지 않습니다.

## 검사

```sh
npm run test:forms
npm test -w @polyspec/validator -- --run
make docs-check
```

서버 검증 사례는 각 패키지 디렉터리에서 실행합니다.

```sh
# packages/validator-php
vendor/bin/phpunit --filter ValidateConformanceTest
# packages/validator-go
go test ./validator/v2/validate -count=1
# packages/validator-rust
cargo test --test validate_conformance
```

`test:forms`는 현재 패키지를 빌드하고 코어, SSR, 마운트한 DOM 테스트를 실행합니다.
공유 DOM 시나리오는 지연 데이터 주입, 편집, 중첩 행 연산, 저장된 키, 체크박스,
날짜, 언어 필드, 조건부 표시를 검사합니다. DOM 테스트는 jsdom을 사용하며 외부
편집기나 브라우저 파일 선택기의 동작을 검증하지 않습니다.
현재 결과는 [기능 상태](../features.ko.md)와 [변경 기록](../../CHANGELOG.ko.md)에 기록합니다.
