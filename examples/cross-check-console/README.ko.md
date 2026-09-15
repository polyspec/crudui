# 교차 검사 콘솔

[English](README.md).

Node HTTP 게이트웨이가 자동 적합성 검사와 같은 CRUDUI 진입점을 별도의 호출 경로로
실행합니다. 임의의 명세와 데이터를 받아 네 검증기와 세 SSR 생성기 사이의 일치나
차이를 보여 줍니다.

한 프로세스(`server/server.mjs`)가 맡는 역할은 다음과 같습니다.

- `POST /api/validate` — 4개 언어 CRUDUI 폼 검증 팬아웃. 네 언어 모두(JS 포함)
  stdin JSON CLI 하위 프로세스로 실행합니다(레거시 래퍼가 아닌 CRUDUI 래퍼). 순서는
  compose → forbidden-scan → validate입니다. 게이트웨이는 검증기를 하나도 import하지
  않는 순수 오케스트레이터이며 특권 경로가 없으므로 네 언어가 완전히 대칭입니다.
- `POST /api/validate-list` — 4개 언어 CRUDUI 목록 구조 검증 팬아웃. `/api/validate`의
  검증 짝입니다(SPEC §9). 같은 네 CLI가 `mode:"list"`로 분기합니다(목록 트리에 대한
  compose → forbidden-scan). 목록은 행을 담지 않으므로(행은 주입되며 DB와 무관)
  데이터 단계가 없고 `data`를 생략합니다. 금지된 메타 키는 같은 `failure` 기록으로
  나타납니다.
- `POST /api/validate-detail` — 4개 언어 CRUDUI 상세 구조 검증 팬아웃. 네 CLI가
  `mode:"detail"`로 분기합니다(루트와 `fields` 맵의 compose → forbidden-scan). 상세
  검증은 레코드를 담지 않으므로 `data`를 생략합니다.
- `POST /api/render` — 3개 프레임워크 CRUDUI 폼 SSR. React와 Svelte(동기), Vue(비동기)
  모두 적합성 테스트가 import하는 CRUDUI 진입점을 통해 프로세스 안에서 렌더링합니다
  (Svelte 어댑터가 `.svelte` 파일을 컴파일하므로 번들러 없는 CLI는 불가능하지만, 세
  프레임워크를 같은 방식으로 불러오므로 렌더링 쪽도 대칭입니다).
- `POST /api/render-list` — 3개 프레임워크 CRUDUI 목록 SSR. `/api/render`의 읽기
  짝입니다(SPEC §9). 목록 명세와 주입한 행을 세 목록 SSR 진입점으로 팬아웃합니다.
  모든 프레임워크가 목록 렌더링 적합성 테스트와 같은 `options.layout`(`table` 또는
  `card`)을 받으므로 정규화한 세 출력이 하나의 일치 키로 모입니다.
- `POST /api/render-detail` — 3개 프레임워크 CRUDUI 상세 SSR. 상세 명세와 주입한
  레코드 하나를 세 상세 SSR 진입점(각 생성기 패키지의 `renderDetail`)으로
  팬아웃합니다. React SSR의 이미지 preload 링크는 목록과 똑같이 비교 전에 제거합니다.
  레코드를 그대로 전달하므로 객체가 아닌 레코드는 세 프레임워크 모두에서
  `INVALID_FORM_INPUT`으로 나타납니다.
- 정적 콘솔 — `client/`를 `/`에서 제공합니다(빌드 없음, 일반 ES 모듈).

## 독립 검증인 이유

적합성 검사(`tests/runner/compare-all.js`와 세 `form-render.conformance` 테스트, 목록
렌더링 적합성, 4개 언어 목록 구조 적합성)는 vitest, go test, cargo test, PHP 워커로
고정 픽스처에 대해 CRUDUI 엔진을 실행합니다. 콘솔은 같은 CRUDUI 함수를 HTTP
게이트웨이로 자유로운 실시간 입력에 대해 실행합니다. 엔진은 같고 래퍼가 다르므로 한
경로의 버그가 다른 경로의 버그를 가릴 수 없습니다. JS의 프로세스 내 import를 없애 이
성질이 강해졌습니다. 이제 JS도 PHP·Go·Rust와 똑같이 CLI로 실행하므로 게이트웨이 안에서
우대받는 언어가 없고, 4개 언어 일치는 특권 호출 경로의 부산물이 아니라 엔진의
결정성입니다. 실시간으로 보고된 차이는 픽스처 케이스로 내보내 적합성 모음에 회귀
테스트로 추가할 수 있습니다.

콘솔은 서버의 판정을 신뢰하지 않습니다. 실행할 때마다 원시 항목별 결과에서
`idempotent`(4개 언어 일치)와 `parity`(3개 프레임워크 일치)를 다시 계산하고, 언어별·
프레임워크별 원시 바이트를 보여 주므로(raw 토글) 콘솔 자신의 판정을 원본 데이터와
대조해 다시 확인할 수 있습니다.
[콘솔 측 판정 재계산](#콘솔-측-판정-재계산)을 참고하세요.

## 엔드포인트

```
POST /api/validate      { spec, data, files?, basepath? }
  → 200 { results:[{lang,ok,valid,errors,ms,failure}], idempotent, mismatch }

POST /api/validate-list { listSpec | spec, files?, basepath? }   # no data — a list has no rows
  → 200 { results:[{lang,ok,valid,errors,ms,failure}], idempotent, mismatch }

POST /api/validate-detail { detailSpec | spec, files?, basepath? }   # no data — no record is validated
  → 200 { results:[{lang,ok,valid,errors,ms,failure}], idempotent, mismatch }

POST /api/render        { spec, data, options:{language,unsupported} }
  → 200 { results:[{fw,ok,html,normalized,ms,error}], parity, mismatch }

POST /api/render-list   { listSpec | spec, rows, options:{language,layout?} }
  → 200 { results:[{fw,ok,html,normalized,ms,error}], parity, mismatch }

POST /api/render-detail { detailSpec | spec, record, options:{language,files?} }
  → 200 { results:[{fw,ok,html,normalized,ms,error}], parity, mismatch }

GET  /health            → 200 { status:"ok", timestamp }
GET  /                  → static console (client/)
```

`spec`(와 `listSpec`)는 YAML 문자열이나 이미 파싱한 객체 중 어느 것이든 받습니다.
목록 엔드포인트에서는 `listSpec`이 정식 키이고 `spec`은 별칭이며, 상세 엔드포인트에서는
`detailSpec`이 정식 키이고 `spec`이 별칭입니다. 잘못된 YAML 문자열이나 명세 누락은
400입니다. 검증·렌더링 실패는 HTTP 오류가 아니라 결과로 나타납니다(항상 200).
해석되지 않는 `$ref`/`$patch`/금지 키는 로드 실패이고, 루트·그룹·반복 데이터의 형태가
틀리면 입력 실패입니다. 모든 검증기 CLI는 두 경우 모두 종료 상태 2와 정확히
`{ error, code, at }`를 보고하며, 게이트웨이는 이를 `valid:false`와 구분되는
`failure: { code, message, at }`로 노출합니다. 실제 서버 오류만 `{ error }`와 함께
4xx/5xx를 사용합니다.

## 실행

Go와 Rust CRUDUI 검증기는 먼저 컴파일해야 하는 하위 프로세스 CLI입니다. JS CRUDUI 검증
CLI(`packages/validator-ts/bin/validate.mjs`)는 `tsx` 로더(`node --import tsx`)로
TypeScript CRUDUI 소스를 실행합니다. 별도 빌드는 없지만 `tsx`가 설치되어 있어야 합니다
(워크스페이스 devDependency이므로 저장소 루트에서 `npm install`을 한 번 실행합니다). 세
생성기는 게이트웨이 시작 시 프로세스 안의 Vite SSR 로더로 TypeScript 소스에서
불러옵니다.

```bash
# 1. PHP deps (once)
cd packages/validator-php && composer install && cd -

# 2. tsx for the JS CRUDUI CLI (workspace devDependency)
npm install                  # at repo root, installs tsx + js-yaml + vite/svelte

# 3. build the Go + Rust CRUDUI CLIs (the server expects them at fixed paths;
#    `npm test` runs this first, so tests always use the current sources)
cd examples/cross-check-console/server
npm run build:cli            # = build:go + build:rust
#   go build -o ../../../packages/validator-go/validate ./cmd/validate
#   cargo build --locked --release --bin validate  (in packages/validator-rust)
npm run check:js-cli         # smoke-test the JS CRUDUI CLI (node --import tsx)

# 4. start the gateway (boots the CRUDUI render engine, then serves)
npm start                    # PORT=4000 by default
```

http://localhost:4000 을 열고 예제를 고른 뒤 명세와 데이터를 편집하고 실행합니다.

## 세 탭: 폼, 목록, 상세

콘솔에는 여섯 엔드포인트를 다루는 세 탭이 있습니다. 패널은 DOM을 공유하지 않으며,
탭 전환은 어떤 `<main>`을 보일지만 바꿉니다.

- **폼 탭** — `POST /api/validate`(4개 언어 폼 검증)와 `POST /api/render`(3개
  프레임워크 폼 SSR)를 병렬로 호출합니다. 명세 편집기, 데이터 편집기, `unsupported`
  토글, 픽스처 내보내기가 있습니다.
- **목록 탭** — 세 행렬을 위에서 아래로 쌓아 폼 탭처럼 검증(4개 언어) → 렌더링(3개
  프레임워크) 순서로 읽힙니다.
  1. `POST /api/validate-list` — 4개 언어 목록 구조 검증(compose → forbidden-scan,
     행 없음). 폼 탭과 같은 일치 행렬로 그리며, 금지된 메타 키는 같은 `failure`
     셀로 나타납니다.
  2. `listSpec.search`의 `POST /api/render` — 내장된 `search` 슬롯은 폼 명세이며,
     바뀌지 않고 왕복함을 보이기 위해 같은 폼 엔드포인트로 렌더링합니다. 목록
     렌더러는 `search` 슬롯을 무시하므로(columns / sort / pagination / empty / actions만
     읽음) 폼 엔드포인트가 받는 것도 같은 명세 객체입니다. `search` 슬롯이 없는 목록
     명세는 가짜 결과 대신 대기 안내를 보여 줍니다.
  3. `POST /api/render-list` — 주입한 행에 대한 3개 프레임워크 목록 SSR. 열, 형식,
     페이지 나누기는 목록 명세에 선언하고 행은 별도의 JSON 편집기에 둡니다(DB와
     무관). 폼 탭과 같은 일치 행렬로 그립니다.

  목록 명세 편집기와 행 편집기는 각각 초록/빨강 파싱 배지를 달며, 파싱에 실패하면 목록
  실행 버튼이 비활성화됩니다. `search` 폼 명세를 재사용하므로 같은 `search(form-spec)`가
  폼 탭이 직접 실행하는 폼 엔드포인트를 거쳐 왕복합니다.
- **상세 탭** — 두 행렬, 검증(4개 언어) → 렌더링(3개 프레임워크):
  1. `POST /api/validate-detail` — 4개 언어 상세 구조 검증(compose → forbidden-scan,
     레코드는 검증하지 않음). 같은 일치 행렬로 그립니다.
  2. `POST /api/render-detail` — 주입한 레코드에 대한 3개 프레임워크 상세 SSR. 같은
     일치 행렬로 그립니다.

  상세 명세 YAML 편집기와 레코드 JSON 편집기에는 파싱 배지가 있으며, 파싱에 실패하면
  실행 버튼이 비활성화됩니다. 레코드 편집기는 어떤 JSON 값이든 받아 그대로 보내므로
  렌더러 자체의 입력 오류를 볼 수 있습니다. 예제는 `tests/fixtures/detail-render`와
  `tests/fixtures/detail-validity`를 인용합니다.

## 콘솔 측 판정 재계산

서버가 `idempotent` / `parity`를 보고하지만 콘솔은 이를 신뢰하지 않습니다. 실행할
때마다 원시 항목별 결과에서 둘 다 다시 계산하므로 화면의 배지는 독립적으로 도출됩니다.

- `idempotent`(validate / validate-list) — 언어별 안정 서명(전체 실패 기록, 또는
  valid와 정렬한 5필드 오류이며, Rust f64와 정수 직렬화 차이로 거짓 불일치가 나지 않도록
  숫자 `value`를 통일함). 실패한 CLI(`ok:false`)는 별도 서명을 가지므로 조용히 일치로
  처리되지 않습니다. 실행된 언어가 둘 미만이면 false가 아니라 판정 불가(null)입니다.
- `parity`(render / render-list / search 렌더링) — 성공한 프레임워크는
  `html:<normalized>`로, 실패한 프레임워크는 `error:<code>`로 서명합니다(네임스페이스가
  달라서 다른 프레임워크가 렌더링할 때 한 프레임워크가 예외를 던지면 조용히 빠지지 않고
  일치 깨짐이 됩니다). 렌더링한 프레임워크가 둘 미만이면 판정 불가(null)입니다.

어긋난 실행은 문제가 된 열을 빨갛게 칠하고 항목별 차이 표(어느 언어·프레임워크가 어떤
경로·규칙이나 태그·속성에서 갈렸는지)를 그립니다. `raw` 토글은 가공한 모든 셀을 서버의
원문 JSON 항목으로 바꾸며 raw가 모든 화면보다 우선하므로, 콘솔 자신의 판정을 원본과
대조해 감사할 수 있습니다.

## 픽스처 내보내기

각 탭은 현재 실행을 맞는 `cases.json` 형태로 직렬화해 내려받으며, 언어·프레임워크마다
케이스 하나를 만듭니다.

- 폼 탭 → `tests/fixtures/{validate,form-render}/cases.json` 형태: validate는
  `{name,note,spec,data,expected:{valid,errors}}`(또는 `expectFailure:{code,message,at}`),
  form-render는 `{name,note,spec,data,options,expected_html}`(또는 `{expected_error}`).
- 목록 탭 → `tests/fixtures/list-render/cases.json` 형태:
  `{name,note,spec,rows,options,expected_html|expected_error}`. `spec`은 목록 명세를
  그대로 담으며(`search` 슬롯이 있으면 포함), 목록 적합성 리더는 실시간 렌더러와 똑같이
  그 슬롯을 무시합니다.
- 상세 탭 → `tests/fixtures/detail-render/cases.json` 형태:
  `{name,note,spec,record,options,expected_html|expectError:{code,message}}`.

내보낸 어긋난 케이스를 자동 검사(`compare-all.js` / `*.conformance`)에 추가하면 회귀
테스트로 유지됩니다.

## 로컬 curl 스모크 테스트

```bash
# validate: conditional required fires → all 4 langs invalid@email:required
curl -s -X POST localhost:4000/api/validate -H 'Content-Type: application/json' \
  -d '{"spec":{"type":"group","properties":{"subscribe":{"type":"checkbox"},"email":{"type":"email","validate":{"required":".subscribe"}}}},"data":{"subscribe":true,"email":""}}'
# → idempotent:true, every lang valid:false with required@email

# validate: unresolved $ref → load failure in all 4 langs (NOT valid:false)
curl -s -X POST localhost:4000/api/validate -H 'Content-Type: application/json' \
  -d '{"spec":{"type":"group","properties":{"$ref":"Missing.yml"}},"data":{}}'
# → idempotent:true, every lang failure.code REF_FILE_NOT_FOUND

# render: email field → 3 frameworks parity, normalized == fixture expected_html
curl -s -X POST localhost:4000/api/render -H 'Content-Type: application/json' \
  -d '{"spec":{"type":"group","properties":{"email":{"type":"email","label":{"ko":"이메일","en":"Email"}}}},"data":{},"options":{"language":"ko"}}'
# → parity:true

# render: unsupported field type with unsupported:"throw" → 3 frameworks error
curl -s -X POST localhost:4000/api/render -H 'Content-Type: application/json' \
  -d '{"spec":{"type":"group","properties":{"x":{"type":"totally-unknown-widget"}}},"options":{"unsupported":"throw"}}'
# → parity:true, every fw error.code UNSUPPORTED_FIELD_TYPE

# validate-list: clean list STRUCTURE → all 4 langs valid:true (no data pass)
curl -s -X POST localhost:4000/api/validate-list -H 'Content-Type: application/json' \
  -d '{"listSpec":{"columns":{"name":{"field":"name","label":{"ko":"이름","en":"Name"}}}}}'
# → idempotent:true, every lang valid:true (mode:list, compose → forbidden-scan)

# validate-list: unresolved column $ref in a list → load failure in all 4 langs
curl -s -X POST localhost:4000/api/validate-list -H 'Content-Type: application/json' \
  -d '{"listSpec":{"columns":{"$ref":"Missing.yml"}}}'
# → idempotent:true, every lang failure.code REF_FILE_NOT_FOUND

# validate-detail: a forbidden meta key on a field → the same load failure in all 4 langs
curl -s -X POST localhost:4000/api/validate-detail -H 'Content-Type: application/json' \
  -d '{"detailSpec":{"fields":{"name":{"field":"name","show_if":".admin"}}}}'
# → idempotent:true, every lang failure.code FORBIDDEN_META_KEY at fields.name.show_if

# render-list: 2 injected rows + a column → 3 frameworks parity on the same table
curl -s -X POST localhost:4000/api/render-list -H 'Content-Type: application/json' \
  -d '{"listSpec":{"columns":{"name":{"field":"name","label":{"ko":"이름","en":"Name"}}}},"rows":[{"name":"Ada"},{"name":"Lin"}],"options":{"language":"ko"}}'
# → parity:true, normalized table == fixture expected_html

# render-detail: one injected record → 3 frameworks parity on the same definition list
curl -s -X POST localhost:4000/api/render-detail -H 'Content-Type: application/json' \
  -d '{"detailSpec":{"fields":{"name":{"field":"name","label":{"ko":"이름","en":"Name"}},"status":{"field":"status","label":{"ko":"상태","en":"Status"}}}},"record":{"name":"<Ada & Lin>","status":"active"},"options":{"language":"en"}}'
# → parity:true, normalized <dl class="crudui-detail">… == detail-render basic-fields expected_html

# render-detail: non-object record → the same input error in all 3 frameworks
curl -s -X POST localhost:4000/api/render-detail -H 'Content-Type: application/json' \
  -d '{"detailSpec":{},"record":[]}'
# → parity:true, every fw error.code INVALID_FORM_INPUT ("Detail record must be an object")
```

## 구성

```
server/
  server.mjs          gateway: routes (validate, validate-list, validate-detail, render, render-list, render-detail) + CORS + always-200 + static serving
  engine.mjs          one Vite SSR boot → loads the 3 CRUDUI form, list and detail RENDER entries (render only)
  validate-runner.mjs all 4 langs via spawnSync CLI (zero privileged path); validateAll + validateAllList (mode:list) + validateAllDetail (mode:detail); idempotency verdict
  render-runner.mjs   React/Svelte/Vue in-process SSR; renderAll + renderAllList + renderAllDetail; parity verdict
  package.json        start + build:cli + check:js-cli scripts
client/               no-build console (index.html + app.js + examples.js + doc.js + styles.css);
                      three tabs (form, list, detail) over the six endpoints
```

CRUDUI 검증 CLI 래퍼는 각 패키지에 있습니다(JS `bin/validate.mjs`, PHP
`bin/validate.php`, Go `cmd/validate`, Rust `src/bin/validate.rs`). legacy는 건드리지
않습니다.
