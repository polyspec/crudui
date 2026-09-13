# 폼 개발과 검증

[English](forms.md). 계약은 [폼 런타임](../spec/form-runtime.ko.md)에 정의합니다.

## 설치

저장소 루트에서 명령을 실행합니다. Node.js와 npm을 설치한 후 실행합니다.

```sh
npm ci --strict-allow-scripts
npm run build
```

의존성을 갱신할 때는 npm으로 패키지 선언의 버전 범위를 해석하고 잠금 파일을
갱신합니다. 결과 의존성 그래프를 검토하고 아래 검사를 실행합니다.
설치 스크립트 변경을 검토하고 `npm install-scripts approve <package>`로 독립
그래프의 루트 `allowScripts` 필드에 정확한 버전을 기록합니다.
기존 설치에서 새로 승인한 스크립트를 실행하려면 `npm rebuild`를 실행합니다.
컨테이너 이미지는 Puppeteer 브라우저 압축 해제를 위해 `unzip`을 설치합니다.

4개 언어 검증에는 Composer 의존성을 설치한 PHP, Go, Rust가 필요합니다.
`packages/validator-php`에서 `composer install`로 PHP 의존성을 설치합니다.
로컬에 이 도구들이 있으면 컨테이너는 필요하지 않습니다.

## 데이터 로드 전 구성

```tsx
import {
  compileForm, createForm, Form, sequenceRowKey,
} from '@crudui/generator-react';

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
const form = createForm(JSON.parse(cached));

function StoreForm() {
  return <Form form={form} />;
}

form.setData({ stores: { [sequenceRowKey(42)]: { name: 'Store' } } });
const copied = form.copyRow('stores', sequenceRowKey(42));
form.rekeyRow('stores', copied, sequenceRowKey(43));
const submission = form.getData();
```

공유 캐시에는 템플릿을 저장하고 렌더링할 폼마다 독립적인 폼 인스턴스를 생성합니다.
레코드 로드가 완료되면 `setData`를 호출합니다. Vue와 Svelte도 `form` 속성을
받습니다. 프레임워크 패키지는 동일한 코어 함수를 제공합니다.
각 프레임워크는 SSR용 `renderForm(form)`을 export하며 Vue는 Promise를 반환합니다.
`$ref` 파일은 렌더링 전에 컴파일합니다.

프레임워크에 독립적인 HTML은 동등한 renderer 패키지를 사용합니다.

```ts
import { renderForm, renderList } from '@crudui/generator-html';

host.innerHTML = renderForm(form);
const connection = connectForm(host, form);
const listHtml = renderList(listSpec, rows, { layout: 'table' });
```

HTML renderer는 fragment를 반환하며 외부 `form` 요소를 만들거나 브라우저 이벤트를
연결하거나 데이터를 검증하거나 레코드를 로드하지 않습니다.

`@crudui/validator`의 `Validator`와 원본 명세로 `submission`을 검증합니다.
서버가 저장된 seq를 생성하면 해당 컬렉션 경로의 키를 변경합니다.
데이터 객체 전체에서 토큰을 치환하지 않습니다.

## 검사

```sh
npm run test:forms
npm test -w @crudui/validator -- --run
make docs-check
```

서버 검증 사례는 각 패키지 디렉터리에서 실행합니다.

```sh
# packages/validator-php
vendor/bin/phpunit --filter ValidateConformanceTest
# packages/validator-go
go test ./validator/validate -count=1
# packages/validator-rust
cargo test --test validate_conformance
```

`test:forms`는 현재 패키지를 빌드하고 코어, SSR, 마운트한 DOM 테스트를 실행합니다.
공유 DOM 시나리오는 지연 데이터 주입, 편집, 중첩 행 연산, 저장된 키, 체크박스,
날짜, 언어 필드, 조건부 표시를 검사합니다. DOM 테스트는 jsdom을 사용하며 외부
편집기나 브라우저 파일 선택기의 동작을 검증하지 않습니다.
현재 결과는 [기능 상태](../features.ko.md)와 [변경 기록](../../CHANGELOG.ko.md)에 기록합니다.

Svelte 패키지 빌드는 JavaScript, 전처리한 Svelte 컴포넌트, TypeScript 선언을
`dist`에 생성합니다. 공개 export는 패키지에 포함된 파일을 사용합니다.
소비자 빌드는 브라우저 또는 SSR 대상에 맞게 컴포넌트를 컴파일합니다.

`npm run test:packages`는 JavaScript 패키지 전체를 빌드·패키징하고 별도 소비자
프로젝트에 설치합니다. export 파일과 타입 선언을 검사하고 세 폼 컴포넌트를
사용하는 프로덕션 애플리케이션을 컴파일합니다. 통과한 검사는 임시 소비자 프로젝트를
삭제합니다. 실패한 검사는 `failure.log`와 함께 프로젝트를 남기고 경로를 출력합니다.

## 패키지 타입 선언 검사

JavaScript 번들러는 런타임 모듈을 생성합니다. TypeScript 컴파일러는 번들러와
별도로 공개 진입점에서 `noEmitOnError`를 적용해 선언을 생성합니다.
Svelte 컴포넌트와 선언은 패키지 컴파일러를 사용합니다.

```sh
npm run test:build
npm run test:build:repeat
npm run test:packages
```

검증 범위는 [패키지 빌드 계약](../spec/package-build.ko.md)과
[빌드 검사](../../tests/build/README.ko.md)에 정의합니다.
