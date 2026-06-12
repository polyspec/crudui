# Form-Spec 프로젝트 평가 보고서

> **현황 업데이트 (2026-06).** 이 보고서의 §3-§10 평가는 작성 시점 기준이며,
> 아래 항목은 그 이후 실측으로 갱신되었다:
>
> - **크로스 언어 검증 951/951 GREEN** — `tests/cases/*.json` 14개 스위트,
>   951 케이스가 JS/PHP/Go 전부에서 일치 (`tests/runner/compare-all.js` +
>   vitest/PHPUnit/go test 브리지 3종, 2026-06 실행 확인). 게이트 체계는
>   [TESTING.md](./TESTING.md) 참조.
> - **조건식 캐싱 구현 완료** — LRU 캐시
>   (`packages/validator-js/src/parser/ConditionCache.ts`). §3.4 의
>   '구현 없음' 서술은 더 이상 사실이 아니다.
> - **벤치마크 존재** — `packages/validator-js/benchmarks/`
>   (parsing.bench.ts, validation.bench.ts).
> - **골든 HTML 파이프라인 구축** — legacy Limepie 출력(골든 7종,
>   `tests/fixtures/golden-html/`)을 단일진실로 하는 재생성 파이프라인
>   (`tools/limepie-baseline/`)과 React SSR 비교 하네스(`tests/parity/`).
>   parity 는 generator-react 격차가 닫힐 때까지 RED 가 기대 상태다.
> - 빌트인 규칙 수는 **24개 등록명(23개 구현 + pattern/match 별칭)** 이다
>   (`packages/validator-js/src/rules/index.ts`) — 본문 '25+' 표기는 과거 수치.

## 1. 프로젝트 개요

YAML 기반 폼 정의 시스템으로, JavaScript/PHP/Go에서 동일한 검증 로직을 실행하고 React로 폼을 렌더링하는 크로스 플랫폼 폼 라이브러리.

---

## 2. 기술적 의미 (강점)

### 2.1 멱등성 보장
- **핵심 가치**: 동일한 YAML 스펙 → 모든 언어에서 동일한 검증 결과
- 클라이언트/서버 검증 불일치 문제 해결
- 951개 크로스 언어 테스트 케이스(14개 스위트)로 언어 간 일관성 검증

### 2.2 복잡한 폼 구조 지원
- 1,318줄 규모의 ProductNft 같은 e-commerce 폼 완벽 지원
- 다단계 중첩 그룹, 동적 필드 추가/삭제
- 조건부 표시 (display_switch/display_target)

### 2.3 고급 조건식 시스템
- 자체 파서 구현: Lexer → AST → Evaluator
- 상대 경로 (`.field`, `..parent`, `...ancestor`)
- 와일드카드 (`items.*.price`)
- 논리/비교 연산자

### 2.4 코드 품질
- TypeScript strict mode 완전 활성화
- 플러그인 패턴으로 규칙 확장 가능 (빌트인 24개 등록 규칙명 = 23개 구현 + pattern/match 별칭)
- ESM/CJS 듀얼 빌드

### 2.5 실전 검증된 설계
- 복잡한 e-commerce 폼 시스템에서 검증된 설계
- 실제 운영 환경의 요구사항 반영

---

## 3. 부족한 점

### 3.1 생태계 미완성
| 패키지 | 상태 |
|--------|------|
| @form-spec/generator-react | legacy.0.0 완성 |
| @form-spec/validator | legacy.0.0 완성 |
| @form-spec/generator-vue | v0.0.1 미구현 |
| @form-spec/generator-svelte | v0.0.1 미구현 |

### 3.2 에러 처리 미흡 — 부분 해소

조건식 평가 실패 시 기본 동작은 여전히 `false` 폴백이지만, `debug` 옵션을 켜면
표현식·경로·에러를 `console.warn` 으로 남긴다
(`packages/validator-js/src/legacy/Validator.ts` `evaluateCondition`, 776-791행).
기본(debug off)에서는 silent 폴백이 유지된다.

### 3.3 문서화 부족
- 고급 사용법 가이드 없음
- 트러블슈팅 문서 없음
- 성능 최적화 팁 없음

### 3.4 성능 최적화 — 해소됨
- ~~조건식 캐싱 타입만 정의 (CachedCondition), 구현 없음~~ → LRU 캐시 구현 완료
  (`packages/validator-js/src/parser/ConditionCache.ts` — Map + 이중 연결 리스트,
  O(1) lookup/eviction, 히트율 통계)
- ~~대규모 폼 벤치마킹 없음~~ → `packages/validator-js/benchmarks/` 추가
  (`npm run bench`)

### 3.5 커뮤니티/인지도 부재
- npm 미발행 상태 (로컬 파일 참조만)
- GitHub 공개 저장소 없음
- 외부 기여자/사용자 없음

---

## 4. 개선 필요 사항

### 즉시 (High Priority)
1. npm 패키지 발행 (미완)
2. 에러 로깅 개선 (부분 완료 — debug 옵션 로깅, §3.2 참조)
3. ~~기본 벤치마크 추가~~ (완료 — `packages/validator-js/benchmarks/`)

### 중기 (Medium Priority)
1. Vue/Svelte 생성기 구현 (미완 — v0.0.1 placeholder)
2. ~~조건식 캐싱 구현~~ (완료 — `ConditionCache.ts`)
3. 성능 최적화

### 장기 (Low Priority)
1. 비주얼 폼 빌더 (GUI)
2. i18n 규칙 메시지 번들
3. 플러그인 마켓플레이스

---

## 5. 대안 분석

### 5.1 JSON Forms (jsonforms.io)
| 항목 | JSON Forms | Form-Spec |
|------|-----------|-----------|
| 스키마 | JSON Schema 표준 | 자체 YAML 스펙 |
| 프레임워크 | React, Vue, Angular | React (Vue/Svelte 예정) |
| 백엔드 검증 | 없음 (프론트엔드 전용) | JS, PHP, Go |
| 성숙도 | 프로덕션 (수년) | 초기 단계 |
| 커뮤니티 | 활성화 | 없음 |

### 5.2 Formily (alibaba)
| 항목 | Formily | Form-Spec |
|------|---------|-----------|
| 스키마 | JSON Schema | 자체 YAML |
| 성능 | 고성능 최적화 | 미검증 |
| 기능 | 폼 빌더 GUI 포함 | 없음 |
| 복잡도 | 높음 | 낮음 |
| 한국어 문서 | 없음 | 있음 |

### 5.3 React Hook Form + Zod/Yup
| 항목 | RHF + Zod | Form-Spec |
|------|-----------|-----------|
| 접근법 | 코드 기반 | 선언적 YAML |
| 타입 안전성 | 최고 (Zod) | 좋음 |
| 백엔드 검증 | 수동 구현 필요 | 내장 |
| 학습 곡선 | 낮음 | 중간 |

---

## 6. 계속 vs 대체 판단

### 계속 개발이 유리한 경우
1. **다중 백엔드 검증 필수**: PHP + Go + JS 모두 동일한 검증이 필요
2. **복잡한 조건부 로직**: display_switch 같은 고급 기능 활용 중
3. **YAML 선언적 접근 선호**: 코드보다 설정 파일 기반 관리
4. **어드민/CRM 자동화**: 폼 기반 업무 시스템 구축

### 대체 고려가 유리한 경우
1. **프론트엔드 전용**: 백엔드 검증 불필요 시
2. **타입 안전성 최우선**: Zod + React Hook Form
3. **커뮤니티 지원 필요**: 활발한 생태계 원할 경우

---

## 7. 사용자 목적에 따른 재평가

### 핵심 목적 (사용자 답변 기반)
- 스펙 기반 폼 생성 + 프론트/백엔드 동일 검증
- 멱등성 보장으로 어드민/CRM 자동화
- 반복 작업 감소
- Swagger보다 복잡한 폼 정형화

### 이 목적에 대한 대안 분석

| 대안 | 백엔드 검증 | 멱등성 | 복잡한 폼 | 평가 |
|------|------------|--------|----------|------|
| JSON Forms | 없음 | 불가 | 중간 | **부적합** |
| Formily | 없음 | 불가 | 높음 | **부적합** |
| RHF + Zod | 수동 구현 | 보장 안됨 | 낮음 | **부적합** |
| **Form-Spec** | JS/PHP/Go | 보장 | 높음 | **유일한 적합** |

### 결론: 대안 없음

**사용자의 핵심 요구사항(다중 백엔드 멱등성)을 충족하는 대안이 현재 존재하지 않음.**

기존 폼 라이브러리들은 프론트엔드 전용이거나, 백엔드 검증 시 수동으로 별도 구현해야 하므로 멱등성을 보장할 수 없음.

---

## 8. 종합 평가

| 평가 항목 | 점수 | 비고 |
|----------|------|------|
| 아키텍처 | 8.5/10 | 잘 설계된 구조 |
| 코드 품질 | 8.5/10 | TypeScript strict, 일관된 패턴 |
| 기능 완성도 | 7.0/10 | React만 완성, Vue/Svelte 미구현 |
| 문서화 | 7.0/10 | 기본 문서 있음, 고급 가이드 부족 |
| 생태계/커뮤니티 | 3.0/10 | 미발행, 외부 사용자 없음 |
| 차별화 가치 | 8.0/10 | 멱등성, 다중 언어, 복잡한 폼 지원 |

### 결론
**다중 언어 백엔드 검증과 멱등성이 핵심이라면 대안이 없음. 계속 개발 권장.**

---

## Sources
- [JSON Forms](https://jsonforms.io/)
- [vue-form-json-schema](https://github.com/jarvelov/vue-form-json-schema)
- [FormSchema Native](https://github.com/formschema/native)
- [json-schema-form GitHub Topics](https://github.com/topics/json-schema-form)

---

## 9. 개선 작업 계획 (사료 — 당시 계획, 일부 완료)

> 이 절은 작성 시점의 작업 계획 기록이다. 실측 완료 항목:
> #3 조건식 캐싱(`ConditionCache.ts`), #4 벤치마크(`benchmarks/`),
> vitest 커버리지 설정(`vitest.config.ts`). 단위 테스트 강화(#5-8)는 이후
> 951케이스 크로스 언어 conformance 브리지 체계로 대체되었다
> (`packages/validator-js/src/__tests__/conformance.test.ts`). CI 설정은 미구현.

### 브랜치: `feature/quality-improvements`

### 병렬 작업 목록

| # | 작업 | 파일 | 담당 |
|---|------|------|------|
| 1 | 에러 처리 개선 - Validator | `packages/validator-js/src/legacy/Validator.ts` | Agent 1 |
| 2 | 에러 처리 개선 - ConditionParser | `packages/validator-js/src/parser/ConditionParser.ts` | Agent 2 |
| 3 | 조건식 캐싱 구현 | `packages/validator-js/src/parser/ConditionCache.ts` (신규) | Agent 3 |
| 4 | 벤치마크 추가 | `packages/validator-js/benchmarks/` (신규) | Agent 4 |
| 5 | Validator 단위 테스트 강화 | `packages/validator-js/src/__tests__/` | Agent 5 |
| 6 | ConditionParser 테스트 강화 | `packages/validator-js/src/__tests__/` | Agent 6 |
| 7 | PathResolver 테스트 강화 | `packages/validator-js/src/__tests__/` | Agent 7 |
| 8 | Rules 테스트 강화 | `packages/validator-js/src/__tests__/` | Agent 8 |
| 9 | generator-react 테스트 강화 | `packages/generator-react/src/__tests__/` | Agent 9 |
| 10 | 통합 테스트 및 커버리지 설정 | `vitest.config.ts`, CI 설정 | Agent 10 |

### 작업 상세

**1-2. 에러 처리 개선**
- silent failure → 에러 로깅 추가
- ParseError에 컨텍스트 정보 추가
- 디버그 모드 옵션 추가

**3. 조건식 캐싱**
- LRU 캐시 구현
- 파싱된 AST 재사용
- 캐시 히트율 측정

**4. 벤치마크**
- 1,318줄 ProductNft 폼 검증 시간 측정
- 캐싱 전/후 비교
- 메모리 사용량 측정

**5-9. 테스트 강화**
- 각 모듈별 엣지 케이스 추가
- 커버리지 80% 목표

**10. CI/커버리지**
- vitest coverage 설정
- 커버리지 리포트 생성

### 추가 작업 (90% → 100%) - 후속 진행

| # | 작업 | 설명 | 가치 |
|---|------|------|------|
| 11 | TypeScript 타입 생성 | YAML 스펙 → TS interface 자동 생성 | 타입 안전성 극대화 |
| 12 | CLI 도구 | `form-spec validate`, `form-spec generate` | DX 향상 |
| 13 | VS Code 확장 | YAML 스펙 자동완성, 문법 검사 | DX 향상 |
| 14 | 문서 사이트 | VitePress/Docusaurus 기반 문서 | 채택률 향상 |

~~OpenAPI 스키마 생성~~ - 제외 (Form-Spec이 OpenAPI보다 상위 개념, 변환 시 60% 정보 손실)

---

## 10. 이번 작업 범위 (사료 — 당시 실행 계획)

> §9 와 동일한 시점의 기록이다. 현재 진행 상황은 문서 상단
> '현황 업데이트' 절을 보라.

### Phase 1: 즉시 실행 (에이전트 10개 병렬)

| Agent | 작업 | 파일 |
|-------|------|------|
| 1 | 에러 처리 개선 - Validator | `validator-js/src/Validator.ts` |
| 2 | 에러 처리 개선 - ConditionParser | `validator-js/src/parser/ConditionParser.ts` |
| 3 | 조건식 캐싱 구현 | `validator-js/src/parser/ConditionCache.ts` |
| 4 | 벤치마크 추가 | `validator-js/benchmarks/` |
| 5 | Validator 테스트 강화 | `validator-js/src/__tests__/Validator.test.ts` |
| 6 | ConditionParser 테스트 강화 | `validator-js/src/__tests__/ConditionParser.test.ts` |
| 7 | PathResolver 테스트 강화 | `validator-js/src/__tests__/PathResolver.test.ts` |
| 8 | Rules 테스트 강화 | `validator-js/src/__tests__/rules/` |
| 9 | generator-react 테스트 강화 | `generator-react/src/__tests__/` |
| 10 | 커버리지 설정 + 평가보고서 docs 복사 | `vitest.config.ts`, `docs/EVALUATION.md` |

### Phase 2: 후속 작업 (별도 진행)

- TypeScript 타입 생성기
- CLI 도구
- VS Code 확장
- 문서 사이트

### 목표

**이번 작업 완료 시: 80점 → 90점**
**Phase 2 완료 시: 90점 → 100점**
