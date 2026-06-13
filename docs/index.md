---
layout: home

hero:
  name: Form-Spec
  text: YAML 기반 폼 정의 시스템
  tagline: 하나의 스펙으로 4개 언어가 동일한 검증 결과(멱등성)를 보장하고, 3개 프레임워크로 폼을 렌더링한다.
  actions:
    - theme: brand
      text: 문서 색인
      link: /README
    - theme: alt
      text: 스펙 형식
      link: /SPEC
    - theme: alt
      text: API 레퍼런스
      link: /api/

features:
  - title: 멀티언어 검증기
    details: JavaScript/TypeScript, PHP, Go, Rust 가 동일한 스펙·동일한 결과 형식을 사용한다. 크로스 언어 게이트 1013 케이스 전부 GREEN.
  - title: 멀티프레임워크 렌더러
    details: React / Vue 3 / Svelte 5 가 Limepie 골든 HTML 과 byte-parity(7/7) 로 폼을 렌더링한다.
  - title: 조건식 엔진
    details: display_switch / display_target 조건부 표시, lexer + AST 기반 조건식 파서를 4개 언어가 동일하게 구현.
  - title: 기계가독 스펙
    details: validator-js 타입에서 생성한 JSON Schema(draft-07) 로 에디터 자동완성·검증. 자동생성 멀티언어 API 문서 포함.
---

## 개요

Form-Spec 은 YAML 한 벌로 폼의 구조·검증 규칙·조건부 표시를 정의하고, 이를
여러 언어의 검증기와 여러 프레임워크의 렌더러가 **동일하게** 해석하는 시스템이다.

| 영역 | 패키지 | 비고 |
|------|--------|------|
| 검증기 | `validator-js` (`@form-spec/validator`) | TypeScript, 브라우저·Node |
| 검증기 | `validator-php` (`form-spec/validator`) | PHP ^8.2 |
| 검증기 | `validator-go` | `github.com/yejune/form-spec/packages/validator-go` |
| 검증기 | `validator-rust` (`formspec-validator`) | Rust 크레이트 |
| 렌더러 | `generator-react` (`@form-spec/generator-react`) | 골든 7/7 parity |
| 렌더러 | `generator-vue` (`@form-spec/generator-vue`) | SSR, 골든 7/7 parity |
| 렌더러 | `generator-svelte` (`@form-spec/generator-svelte`) | SSR, 골든 7/7 parity |

## 빠른 링크

- [문서 색인](/README) — 전체 문서 목차
- [YAML 스펙 형식](/SPEC) — 스펙 작성법
- [검증 규칙](/VALIDATION-RULES) — 규칙 레퍼런스
- [조건식 파서](/CONDITION-PARSER) · [조건부 표시](/DISPLAY-CONDITIONS)
- [테스트 가이드](/TESTING) · [테스트 케이스](/TEST-CASES)
- [API 레퍼런스 (자동생성)](/api/) — 4언어 기계생성 API 문서
- [문서 자동생성 방법](/CONTRIBUTING-DOCS) — `make docs` 파이프라인

## 검증기 빠른 시작

```typescript
import { Validator } from '@form-spec/validator';

const spec = {
  type: 'group',
  properties: {
    email: {
      type: 'email',
      rules: { required: true, email: true },
      messages: { required: 'Email is required' },
    },
  },
};

const result = new Validator(spec).validate({ email: '' });
// result: { valid: boolean, errors: ValidationError[] }
```

PHP / Go / Rust 의 동등 예시는 [문서 색인](/README#빠른-시작-검증기) 참조.
