# parity — React SSR ↔ Limepie PHP 기준 HTML 자동 비교 하네스

`tests/fixtures/reference-html/*.html`(legacy Limepie PHP 출력, 단일진실)과
`@crudui/generator-react` FormBuilder 의 SSR 출력(`react-dom/server`
`renderToStaticMarkup`)을 정규화 후 비교한다.

- **GREEN 이 기대 상태다 (7/7, 50/50 필드 + chrome).** Phase C 수렴 완료 —
  React 쪽 격차(체크박스 구조, footer/submit 버튼, multiple 마크업, 조건부
  그룹, lang append, search/tinymce/image 레거시 마크업, datetime event,
  items 순서)는 전부 닫혔다. 회귀가 나면 기준 픽스처나 정규화 규칙을 약화해
  GREEN 으로 만들지 마라 — generator-react 구현을 고쳐라.
- 기준 재생성은 `tools/limepie-baseline/` 파이프라인으로만 하라.

## 실행

```sh
cd tests/parity
npm install          # 최초 1회
npm test             # vitest run — 픽스처별 구조화 diff 리포트 출력
# 또는 tests/ 에서: npm run test:parity

node capture-react.mjs <spec.yml> [data.json]   # 단일 스펙 SSR 캡처
node normalize.js <file.html>                   # 정규화 결과 확인
```

실행 산출물 (`out/`, gitignore 됨):

| 파일 | 내용 |
| --- | --- |
| `out/<name>.react.html` | React SSR 원본 캡처 (form 콘텐츠) |
| `out/<name>.reference.norm.txt` | 정규화된 기준 |
| `out/<name>.react.norm.txt` | 정규화된 React 출력 |

## 비교 대상 픽스처

`examples/shared-specs/*.yml` 6종 + `tests/fixtures/specs/ProductNft.yml`.
모두 빈 데이터 렌더(`Generator::write($spec, [])` 기준) 비교다.
`OptionMultiplexable.yml` 은 단독 렌더 불가(host 의존 fragment) — 커버리지는
ProductNft 포함 렌더 안에 있다 (`tools/limepie-baseline/README.md` 참조).

## 정규화 규칙 (normalize.js — 양쪽에 동일 적용, 한쪽만 정규화 금지)

| 규칙 | 내용 |
| --- | --- |
| (a) 토큰 마스킹 | `tools/limepie-baseline/README.md` 의 검증된 4규칙 레시피 포팅 — 무수정 적용. 파싱 전 raw 문자열에 적용, 등장 순서대로 `U1…`/`C1…`/`T1…` 치환 — 상관관계(예: multiple name placeholder == data-uniqid) 보존. bare hex 규칙은 원본 그대로 `{13,14}` — React `generateUniqid()` 가 PHP `uniqid()` 와 같은 13 hex 를 내도록 맞춰져 (과거 12 hex deviation 해소), 토큰 길이 자체도 parity 단언 대상이다. |
| (b) 속성 순서 | 이름 알파벳순 정렬. |
| (c) 태그 사이 공백 | 공백 전용 텍스트 노드(`[ \t\r\n]`) 제거. 혼합 텍스트는 공백 run 을 단일 스페이스로 축약 + 양끝 ASCII 공백 trim. U+00A0(`&nbsp;`)은 공백이 아니라 콘텐츠다(legacy 버튼 라벨이 전부 `&nbsp;`) — 보존된다. |
| (d) HTML 주석 제거 | legacy 출력의 `<!--btn-->` 등 주석은 비교에서 제외한다. **React 는 주석을 출력할 수 없으므로** 주석은 parity 대상이 아니다. 제거 사실을 여기 기록한다 — 주석이 의미를 갖게 되면 이 규칙을 재검토하라. |
| (e) 빈 style 제거 | PHP 는 `style=""` 을 내보내고 React 는 빈 style 객체를 생략한다 → 빈 값 제거. 비어있지 않은 style 은 선언 단위 정규화(`display: none;` == `display:none`). |
| (f) class 값 공백 | 내부 다중 공백 단일화 + trim, 빈 class 속성 제거((e)와 동일 취지). **토큰 순서는 정렬하지 않는다** — class 순서는 규약의 일부다. |
| (g) boolean 속성 | `selected/checked/disabled/readonly/multiple/required/autofocus/novalidate/hidden/open` 은 존재 여부만 비교 (`selected="selected"` == `selected=""`). |

parse5 파싱 + 재직렬화가 추가로 통일하는 직렬화 차이(규칙이 아니라 파서
사실): 따옴표 스타일(`class='x'` vs `class="x"`), void 요소 self-closing
표기(`<input />` vs `<input/>`), 엔티티 인코딩.

### 토큰 ordinal 재번호 (relabelTokens)

(a)의 마스킹 번호는 문서 전역 등장 순서다. 한쪽이 섹션을 통째로 빠뜨리면
이후 모든 ordinal 이 밀려 구조 동일 필드가 가짜 diff 난다. 필드/chrome 단위
비교는 블록 내부 등장 순서로 토큰을 재번호한다. 전역 상관관계는 전체
canonical 동등성 비교가 계속 강제한다 — 재번호는 진단용이다.

## 비교 구조

- **field**: 최상위 `.form-group` 의 직계 자식(필드/그룹 wrapper)을 위치
  기준으로 짝지어 비교. 양쪽 wrapper `name` 키를 함께 보고해 name 접두사
  드리프트가 보이게 한다.
- **chrome**: 필드 subtree 를 `<<FIELD key>>` 마커로 치환한 나머지 전부 —
  최상위 label/description/`<hr>`, 버튼 행, form-group 셸.
- **overall**: 전체 canonical 문자열 동등성. 이것이 테스트의 assert 대상이다.

## 캡처 측 처리 (capture-react.mjs)

| 처리 | 이유 |
| --- | --- |
| `<form>` wrapper 제거 | legacy `Generator::write()` 는 form **콘텐츠**를 반환하고 `<form>` 태그는 host 페이지 소유다. React FormBuilder 는 자체 `<form class="form-builder" novalidate>` 를 렌더하므로 비교 전에 벗긴다. wrapper 자체는 parity 대상이 아니다. |
| 단일 React realm | react / react-dom / generator dist 를 전부 `packages/generator-react` 에 앵커한 `createRequire` 로 로드한다. 이 파일에서 react 를 직접 import 하지 마라 — React 사본이 2개가 되어 hooks 가 깨진다. |
| 순서 보존 YAML 로더 | `yaml`(eemeli) `parseDocument` + 커스텀 변환 (`uniqueKeys: false`). 중복 매핑 키 last-wins(첫 키 위치 유지) — legacy ext-yaml(libyaml) 동작과 동일 (ProductNft.yml 이 문자 그대로의 중복 키 포함). `items` 매핑이 정수형 키 때문에 plain object 반복 순서와 문서 순서가 달라지는 경우(ProductNft is_option 0/2/1)에만 generator 의 ordered pair 형태(`[[key, label], ...]`)로 변환 — PHP 배열은 YAML 매핑 순서를 보존하지만 JS plain object 는 정수형 키에서 불가능하므로, 순서는 pair 형태가 운반하고 렌더는 generator(`itemEntries`)가 소유한다. 순서가 안정적인 매핑은 plain object 그대로. |
| `$ref` 해석 | 상대 파일 참조만 in-place 병합 (픽스처가 실제 사용하는 Limepie `ReferenceResolver` 부분집합). `(file).keypath` 형태와 `$after/$before/$merge/$remove` 는 미구현 — 픽스처 스펙에 등장하지 않으며, React generator 가 스스로 처리해야 할 변환을 하네스가 대신 메우면 generator 격차가 가려진다. |
| SSR 크래시 우회 | DOM 전역(window/document/navigator) 참조로 크래시하면 jsdom 전역 주입 후 1회 재시도하고 크래시 사실을 리포트에 남긴다. generator-react src 수정은 하네스 범위 밖(Phase C)이다. 현재 7개 픽스처 전부 bare SSR 로 크래시 없이 렌더된다. |

## 알려진 하네스 한계

- JS 객체는 정수형 키를 재정렬한다(YAML `0:/1:/2:` 매핑). PHP 는 삽입 순서
  보존 — 정수 키가 내림차순으로 정의된 스펙이 생기면 가짜 diff 가 난다.
  현재 픽스처에는 해당 없음.
- 마스킹 rule 4(`_<5자>`)는 `_check` 같은 일반 단어도 칠 수 있다 — 양쪽에
  동일 적용되므로 동등성 판정은 안전하고, diff 표시에만 마스킹 토큰이 섞여
  보일 수 있다.
