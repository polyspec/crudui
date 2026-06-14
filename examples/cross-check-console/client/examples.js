/**
 * Example specs + data for the cross-check console.
 *
 * Sourced from tests/fixtures/{validate,v2-render}/cases.json — these are the
 * SAME inputs the AI gate (compare-all.js / *.conformance) runs. The console
 * flows them through the live HTTP gateway; the gate flows them through
 * vitest/go test/cargo test/php worker. Same v2 engine, different call stack.
 *
 * Each example carries spec (YAML string), data (JSON string) and options.
 * Do NOT invent new shapes here — quote the fixtures.
 */

/** @typedef {{ id: string, name: string, note: string, spec: string, data: string, options: { language: 'ko'|'en', unsupported: 'throw'|'marker' } }} Example */

/** @type {Example[]} */
export const examples = [
  {
    id: 'basic',
    name: 'basic — email + conditional required',
    note: 'validate/cases.json conditional-required: required:".subscribe" fires when subscribe truthy and email empty → js/php/go/rust all invalid@email:required.',
    spec: `type: group
properties:
  subscribe:
    type: checkbox
  email:
    type: email
    label:
      ko: 이메일
      en: Email
    validate:
      required: .subscribe`,
    data: `{
  "subscribe": true,
  "email": ""
}`,
    options: { language: 'ko', unsupported: 'throw' },
  },
  {
    id: 'complex',
    name: 'complex — condition-map min + design.show + i18n + multiple rows',
    note: 'condition-map min:{".vip":10, true:1} (first-truthy), design.show ".subscribe", bilingual label, multiple:true two rows (data-uniqid 0/1, clone-element). VIP qty=5 < 10 → invalid@qty:min.',
    spec: `type: group
properties:
  vip:
    type: checkbox
  subscribe:
    type: checkbox
  qty:
    type: number
    label:
      ko: 수량
      en: Quantity
    validate:
      min:
        .vip: 10
        true: 1
  email:
    type: email
    label:
      ko: 이메일
      en: Email
    design:
      show: .subscribe
  tags:
    type: text
    label:
      ko: 태그
      en: Tags
    multiple: true`,
    data: `{
  "vip": true,
  "subscribe": 1,
  "qty": 5,
  "email": "",
  "tags": ["a", "b"]
}`,
    options: { language: 'ko', unsupported: 'throw' },
  },
  {
    id: 'edge-ref',
    name: 'edge — unresolved $ref (REF_FILE_NOT_FOUND)',
    note: 'compose/$ref → Missing.yml not in files → LOAD error, NOT valid:false. 4 langs return loadError{code:REF_FILE_NOT_FOUND}; 3 frameworks return error{code:REF_FILE_NOT_FOUND}. v1 gap (ProductNft.yml:873) closed.',
    spec: `type: group
properties:
  $ref: Missing.yml`,
    data: `{}`,
    options: { language: 'ko', unsupported: 'throw' },
  },
  {
    id: 'edge-unsupported',
    name: 'edge — unsupported field type (UNSUPPORTED_FIELD_TYPE)',
    note: 'totally-unknown-widget has no v2 generator. options.unsupported:"throw" → render error{code:UNSUPPORTED_FIELD_TYPE}. Flip the unsupported toggle to "marker" to render a stub instead of throwing.',
    spec: `type: group
properties:
  x:
    type: totally-unknown-widget
    label:
      ko: 미지원
      en: Unsupported`,
    data: `{}`,
    options: { language: 'ko', unsupported: 'throw' },
  },
  {
    id: 'mismatch-slot',
    name: 'mismatch — intentional-divergence slot (paste exported case)',
    note: 'All current fixtures agree, so this slot is EMPTY by design. Paste a case you exported after finding a live divergence (e.g. Rust diverging on a condition map) here, then run — the console must light the red mismatch panel + per-lang diff. This proves the mismatch UI actually works; it is not decorative.',
    spec: `# Paste a divergent spec here, or export a live case and reload it.
# Example shape (a single field that you suspect renders/validates
# differently in one language/framework):
type: group
properties:
  field:
    type: text
    label:
      ko: 필드`,
    data: `{
  "field": ""
}`,
    options: { language: 'ko', unsupported: 'throw' },
  },
];

export const defaultExampleId = 'basic';

// ---------------------------------------------------------------------------
// List-spec examples for the list tab.
//
// Sourced from tests/fixtures/v2-list-render/cases.json (basic-columns,
// format-date/number/badge/bool, column-show-expr, i18n-header) and flowed
// through POST /api/render-list. `rows` are INJECTED — the list spec declares
// columns/format/search/pagination, never a DB. The `search` slot IS a
// form-spec; the list tab renders it through the form endpoint (/api/render)
// to prove the form-spec round-trips unchanged. The list renderers ignore the
// `search` slot (they read only columns/sort/pagination/empty/actions), so the
// SAME spec object is what the form endpoint receives.
//
// Do NOT invent column/format shapes here — quote the fixtures.
// ---------------------------------------------------------------------------

/** @typedef {{ id: string, name: string, note: string, spec: string, rows: string }} ListExample */

/** The injected display rows shared by both list examples (the fixture rows). */
const LIST_ROWS = `[
  { "id": 1, "name": "Ada", "status": "active",  "joined": "2026-01-02T09:00:00", "score": 1234567.5, "admin": 1, "avatar": "/img/ada.png", "secret": "X-1" },
  { "id": 2, "name": "Lin", "status": "blocked", "joined": "2026-03-15T12:00:00", "score": 42,         "admin": 0, "avatar": "/img/lin.png", "secret": "X-2" }
]`;

/** @type {ListExample[]} */
export const listExamples = [
  {
    id: 'list-basic',
    name: 'list basic — columns + date/number/badge format',
    note: 'v2-list-render basic-columns + format-date(YYYY-MM-DD) + format-number(decimals/thousands/$prefix) + format-badge(map). rows injected; 3 frameworks render the SAME normalized table → parity.',
    spec: `columns:
  name:
    field: .name
    label:
      ko: 이름
      en: Name
  status:
    field: .status
    label:
      ko: 상태
      en: Status
    format:
      type: badge
      map:
        active: success
        blocked: danger
  joined:
    field: .joined
    label: Joined
    format:
      type: date
      pattern: YYYY-MM-DD
  score:
    field: .score
    label: Score
    format:
      type: number
      decimals: 2
      thousands: true
      prefix:
        en: $`,
    rows: LIST_ROWS,
  },
  {
    id: 'list-search-conditional',
    name: 'list search — i18n header + conditional column + embedded search form',
    note: 'design.show ".admin" hides the secret column when row.admin falsy (column-show-expr). i18n header (label.ko/en) follows the KO/EN toggle. The `search` slot is a form-spec rendered via /api/render(form) ABOVE the list — form-spec reuse, proven live.',
    spec: `# search IS a form-spec; the list tab renders it through /api/render (form),
# the SAME endpoint the form tab uses. The list renderers ignore this slot.
search:
  type: group
  properties:
    keyword:
      type: text
      label:
        ko: 검색어
        en: Keyword
    status:
      type: select
      label:
        ko: 상태
        en: Status
      options:
        active:
          ko: 활성
          en: Active
        blocked:
          ko: 차단
          en: Blocked
columns:
  name:
    field: .name
    label:
      ko: 이름
      en: Name
  admin:
    field: .admin
    label:
      ko: 관리자
      en: Admin
    format:
      type: bool
      "true": "Yes"
      "false": "No"
      as: check
  secret:
    field: .secret
    label:
      ko: 비밀
      en: Secret
    design:
      show: .admin
pagination:
  perPage: 20`,
    rows: LIST_ROWS,
  },
];

export const defaultListExampleId = 'list-basic';
