/**
 * Spec-syntax doc shown in the collapsible side panel. Mirrors the v2
 * semantics the engine enforces (role slots, condition maps, compose,
 * lang, design node map). Each entry quotes a real fixture so the doc never
 * drifts from what the gate actually runs.
 */

/** @type {{ title: string, body: string }[]} */
export const docSections = [
  {
    title: '역할 슬롯 (role slots)',
    body:
      'v2 필드는 관심사를 슬롯으로 분리한다. ' +
      'validate(검증 규칙), design(show/class/style 표현식 → 마크업), ' +
      'behavior(opaque passthrough), options(buildForm 옵션). ' +
      '한 필드가 여러 슬롯을 동시에 가질 수 있다.',
  },
  {
    title: '조건맵 (condition map)',
    body:
      '{ ".vip": 10, "true": 1 } 은 선언 순서대로 first-truthy 평가한다. ' +
      '".vip" 가 truthy 면 10, 아니면 fallback "true" 가 1 을 준다. ' +
      'resolveConditionMap 의 "true" 는 항상 마지막 fallback. ' +
      '출처: validate/cases.json condition-map-min-vip.',
  },
  {
    title: '합성 ($ref / $patch)',
    body:
      'compose 패스가 $ref/$patch 를 단일 스펙으로 확장한다. ' +
      '미해결 $ref 는 LOAD 에러이지 valid:false 가 아니다 — ' +
      '4언어 loadError{code:REF_FILE_NOT_FOUND}, 3프레임워크 error 로 표면화. ' +
      'v1 갭(ProductNft.yml:873, silent skip) 폐쇄. ' +
      '출처: v2-render compose-ref-unresolved-load-error.',
  },
  {
    title: '언어 (options.language)',
    body:
      'options.language(ko/en) 가 label/text i18n 맵을 평가한다. ' +
      '동일 스펙·다른 언어 = 다른 HTML. ' +
      '상단 KO/EN 토글이 이 값을 렌더 요청 options 로 전달한다.',
  },
  {
    title: 'design 노드맵 (show)',
    body:
      'design.show 표현식이 truthy 면 표시, falsy 면 wrapper 에 ' +
      'style="display: none" 을 달되 DOM 은 유지한다(레거시 non-removal 계약). ' +
      '제거가 아니라 숨김. 출처: v2-render design-show-expr-falsy.',
  },
  {
    title: '독립 검증 (왜 콘솔과 AI 게이트가 교차하는가)',
    body:
      '콘솔은 임의 입력을 HTTP 게이트웨이로 흘려 validateV2/renderFormV2(SSR) 를 호출한다. ' +
      'AI 게이트(compare-all.js + 3 conformance)는 같은 v2 함수를 vitest/go test/cargo test/php 워커로 호출한다. ' +
      '엔진은 같고 wrapper 가 다르다 — 한 경로의 버그가 다른 경로를 오염시키지 않는다. ' +
      '같은 입력이면 같은 결과여야 하며, 안 나오면 wrapper 버그가 드러난다. ' +
      'raw 토글로 자동 판정을 불신·재검할 수 있고, 픽스처 export 로 라이브에서 깬 케이스를 영구 회귀 테스트로 편입한다.',
  },
];
