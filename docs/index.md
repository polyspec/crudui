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
    details: JavaScript/TypeScript, PHP, Go, Rust 가 동일한 스펙·동일한 결과 형식을 사용한다. 크로스 언어 게이트 1074 케이스 전부 GREEN.
  - title: 멀티프레임워크 렌더러
    details: React / Vue 3 / Svelte 5 가 Legacy 기준 HTML 과 byte-parity(7/7) 로 폼을 렌더링한다.
  - title: CRUDUI 표현식 엔진
    details: 조건을 값에 녹인다 — 제한 DSL(eval 금지)을 4언어가 같은 토큰열·같은 AST·같은 값으로 평가(멱등). 조건맵으로 분기, 조건 전용 메타키 0. (schema §6 은 display_switch/display_target 등 조건 전용 메타키를 금지한다.)
  - title: CRUDUI 도구체인
    details: form-spec CLI(describe/check/explain/list-widgets) · MCP · 크로스-검증 콘솔(4언어 검증 × 3프레임워크 SSR) · nl-to-form 스킬. 모두 코드/스키마 단일진실에 위임한다.
  - title: 기계가독 스펙
    details: validator-ts 타입에서 생성한 JSON Schema(draft-07) 로 에디터 자동완성·검증. 자동생성 멀티언어 API 문서 포함.
---

## 개요

Form-Spec 은 YAML 한 벌로 폼의 구조·검증 규칙·조건부 표시를 정의하고, 이를
여러 언어의 검증기와 여러 프레임워크의 렌더러가 **동일하게** 해석하는 시스템이다.

## 아키텍처

```mermaid
flowchart TD
    spec["YAML 폼 스펙 · 한 파일<br/>type: group / properties<br/><b>단일 진실</b>"]
    spec --> V["검증 (멱등)"]
    spec --> R["렌더 (parity)"]
    V --> VL["validator-ts (TS)<br/>validator-php (PHP ^8.2)<br/>validator-go (Go)<br/>validator-rust (Rust)"]
    R --> RL["generator-react<br/>generator-vue<br/>generator-svelte"]
    VL -->|"공유 픽스처 1074"| CMP["tests/runner/compare-all.js<br/>(4언어 결과 일치)"]
    RL -->|"SSR · 정규화 비교"| G["tests/fixtures/reference-html/*<br/>(Legacy 기준 HTML, 7/7 parity)"]
```

| 영역 | 패키지 | 비고 |
|------|--------|------|
| 검증기 | `validator-ts` (`@crudui/validator`) | TypeScript, 브라우저·Node |
| 검증기 | `validator-php` (`form-spec/validator`) | PHP ^8.2 |
| 검증기 | `validator-go` | `github.com/crudui/crudui/packages/validator-go` |
| 검증기 | `validator-rust` (`formspec-validator`) | Rust 크레이트 |
| 렌더 코어 | `generator-core` (`@crudui/generator-core`) | 프레임워크 무관 buildForm/buildList |
| 렌더러 | `generator-react` (`@crudui/generator-react`) | 기준 HTML 7/7 parity, list List |
| 렌더러 | `generator-vue` (`@crudui/generator-vue`) | SSR, 기준 HTML 7/7 parity, list List |
| 렌더러 | `generator-svelte` (`@crudui/generator-svelte`) | SSR, 기준 HTML 7/7 parity, list List |
| 도구 | `form-spec-cli` (`@crudui/cli`, bin `form-spec`) | describe/check/explain/list-widgets |

## 빠른 링크

- [문서 색인](/README) — 전체 문서 목차
- [schema (헌법)](/schema) — CRUDUI 단일 진실 · 역할 슬롯 · 조건맵 · 합성 · 금지키 게이트(§6) · list-spec(§9)
- [표현식 문법](/EXPRESSION-GRAMMAR) — 4언어 표현식 엔진 단일 진실 (토큰/AST/값 멱등, eval 금지)
- [form-spec CLI](/FORM-SPEC-CLI) · [form-spec MCP](/FORM-SPEC-MCP) — CRUDUI 작성 도구층
- 크로스-검증 콘솔 `examples/cross-check-console` — 4언어 검증 × 3프레임워크 SSR · list 탭
- [YAML 스펙 형식](/SPEC) — 스펙 작성법 (legacy 호환)
- [검증 규칙](/VALIDATION-RULES) — 규칙 레퍼런스
- [조건식 파서](/CONDITION-PARSER) · [조건부 표시 (legacy 호환)](/DISPLAY-CONDITIONS)
- [테스트 가이드](/TESTING) · [테스트 케이스](/TEST-CASES)
- [API 레퍼런스 (자동생성)](/api/) — 4언어 기계생성 API 문서
- [문서 자동생성 방법](/CONTRIBUTING-DOCS) — `make docs` 파이프라인

## 검증기 빠른 시작

```typescript
import { Validator } from '@crudui/validator';

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
