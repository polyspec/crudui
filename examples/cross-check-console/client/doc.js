/**
 * Spec-syntax doc shown in the collapsible side panel. Mirrors the CRUDUI
 * semantics the engine enforces (role slots, condition maps, compose,
 * lang, design node map). Each entry quotes a real fixture so the doc never
 * drifts from what the gate actually runs.
 */

/** @type {{ title: string, body: string }[]} */
export const docSections = [
  {
    title: '역할 슬롯 (role slots)',
    body:
      'CRUDUI 필드는 관심사를 슬롯으로 분리한다. ' +
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
      'legacy 갭(ProductNft.yml:873, silent skip) 폐쇄. ' +
      '출처: form-render compose-ref-unresolved-load-error.',
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
      '제거가 아니라 숨김. 출처: form-render design-show-expr-falsy.',
  },
  {
    title: '독립 검증 (왜 콘솔과 AI 게이트가 교차하는가)',
    body:
      '콘솔은 임의 입력을 HTTP 게이트웨이로 흘려 validate/renderForm(SSR) 를 호출한다. ' +
      'AI 게이트(compare-all.js + 3 conformance)는 같은 CRUDUI 함수를 vitest/go test/cargo test/php 워커로 호출한다. ' +
      '엔진은 같고 wrapper 가 다르다 — 한 경로의 버그가 다른 경로를 오염시키지 않는다. ' +
      '같은 입력이면 같은 결과여야 하며, 안 나오면 wrapper 버그가 드러난다. ' +
      'raw 토글로 자동 판정을 불신·재검할 수 있고, 픽스처 export 로 라이브에서 깬 케이스를 영구 회귀 테스트로 편입한다.',
  },
];

/**
 * List-tab doc — the read-side spec syntax (columns / format / search / paging).
 * Each entry quotes a real list-render fixture so the doc never drifts from
 * what the list conformance gate runs.
 *
 * @type {{ title: string, body: string }[]}
 */
export const listDocSections = [
  {
    title: '컬럼 (columns)',
    body:
      'list-spec 의 columns 맵이 표의 열을 선언한다. ' +
      '각 열은 field(점-경로, 예 ".name") 로 행에서 값을 뽑고, label(문자열 또는 ko/en i18n 맵) 로 헤더를 붙인다. ' +
      'rows 는 주입(injected)이다 — list-spec 은 컬럼만 선언하고 DB 를 모른다. ' +
      '출처: list-render basic-columns.',
  },
  {
    title: '포맷 (format)',
    body:
      'column.format 이 셀 표현을 결정한다. ' +
      'date(pattern:"YYYY-MM-DD"), number(decimals/thousands/prefix), badge(map:{값→색}), ' +
      'bool(true/false 라벨, as:check), choice-label, link, image, html. ' +
      'html 포맷만 verbatim innerHTML 경계다. ' +
      '출처: list-render format-date/number/badge/bool.',
  },
  {
    title: '조건 컬럼 (design.show)',
    body:
      'column.design.show 표현식이 falsy 면 그 열은 행에서 비워진다(헤더는 유지, 값 미표시). ' +
      'design.show ".admin" 은 admin 이 truthy 인 행에서만 secret 값을 노출한다. ' +
      'options.data 와 행 값이 표현식 평가에 들어간다. ' +
      '출처: list-render column-show-expr-hidden/visible.',
  },
  {
    title: '검색폼 (search = form-spec)',
    body:
      'list-spec.search 슬롯은 그 자체가 form-spec(type:group + properties) 이다. ' +
      'list 탭은 이 슬롯을 form 탭과 동일한 /api/render 로 렌더해 리스트 위에 띄운다 — form-spec 재사용 실증. ' +
      'list 렌더러는 이 슬롯을 읽지 않는다(columns/sort/pagination/empty/actions 만 소비) — ' +
      'search 를 넣어도 list parity 는 불변. KO/EN 토글이 search 라벨에도 동일 적용된다.',
  },
  {
    title: '페이징·정렬 (선언만)',
    body:
      'pagination(perPage)·sort 는 선언적 메타다 — list-spec 은 페이지·정렬 UI 와 메타를 표면화할 뿐 ' +
      '실제 적용(쿼리)은 호출자 몫이다. options.pageMeta{page,total} 가 페이지 표시를 채운다. ' +
      '출처: list-render pagination-display/sort-display.',
  },
  {
    title: 'list parity (왜 3프레임워크가 한 문자열로 모이는가)',
    body:
      '같은 list-spec·같은 주입 rows 면 react/vue/svelte 의 normalizeHtml 결과가 한 개로 모여야 parity. ' +
      'React 는 SSR resource-hint(<link rel="preload">) 를 hoist 하므로 게이트와 동일하게 제거 후 비교한다. ' +
      'layout 옵션만 프레임워크별 키가 다르다 — React layout, Svelte mode, Vue layout(card→cards) — ' +
      '게이트웨이가 단일 layout 을 각 키로 매핑한다. ' +
      '미해결 $ref 는 LOAD 에러(REF_FILE_NOT_FOUND)로 표면화되지 silent skip 이 아니다.',
  },
];
