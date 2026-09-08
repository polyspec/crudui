# limepie-baseline — Limepie 기준 HTML 픽스처 파이프라인

`tests/fixtures/reference-html/*.html` 은 legacy **Limepie PHP Generator 의 실제 출력**이며,
이 저장소의 모든 폼 렌더러(React, legacy port 등)가 따라야 하는 **단일진실(source of truth)** 이다.

- 기준 픽스처를 손으로 수정하지 마라. 재생성은 `generate-all.sh` 로만 하라.
- 테스트가 기준과 어긋나면 기준을 고치지 마라 — 구현을 고쳐라.
- 핀 커밋이 아닌 Limepie 로 기준을 재생성하지 마라.

## 핀(pin)

| 항목 | 값 |
| --- | --- |
| Limepie 소스 | `yejune/limepie`, 로컬 체크아웃 `$LIMEPIE_SRC` (env `LIMEPIE_SRC` 로 변경 가능) |
| 핀 커밋 | `a47ccba7e318ae1d364c034b1d7c5b0de8a564bb` — 기준 생성 당시 로컬 체크아웃 HEAD (clean tree 확인). 이 저장소의 어떤 composer.lock 도 limepie 커밋을 기록하지 않는다 — 핀의 유일한 강제 장치는 `generate-all.sh` 의 HEAD 가드다. |
| PHP | 8.4 (로컬 8.4.14 로 검증) |
| YAML 파서 | symfony/yaml v8 (`packages/generator-legacy/limepie/vendor/autoload.php`) — ext-yaml polyfill 로 사용 |

`generate-all.sh` 는 `LIMEPIE_SRC` 의 HEAD 가 핀 커밋과 다르면 즉시 중단한다.

## 구성

```
tools/limepie-baseline/
├── render.php        # php render.php <spec.yml> [data.json]  → stdout 으로 HTML
├── generate-all.sh   # 기준 픽스처 전체 재생성
└── README.md
tests/fixtures/reference-html/   # 기준 픽스처 (이 파이프라인의 출력)
```

## 재생성 절차

```sh
# 1. 핀 확인 (clean tree + 핀 커밋)
git -C $LIMEPIE_SRC rev-parse HEAD   # a47ccba... 여야 함
git -C $LIMEPIE_SRC status --porcelain  # 출력 없어야 함

# 2. 전체 재생성
bash tools/limepie-baseline/generate-all.sh

# 3. 단일 스펙 렌더 (확인용)
php tools/limepie-baseline/render.php examples/legacy/shared-specs/product-form.yml
php tools/limepie-baseline/render.php spec.yml data.json   # 데이터 포함 렌더
```

기준 픽스처는 모두 **빈 데이터 렌더** (`Generator::write($spec, [])`) 기준이다.

## render.php 가 재현하는 런타임 환경

Limepie 는 웹 런타임 전역 상태에 의존한다. render.php 는 아래 shim 으로 이를 고정한다.

| shim | 이유 |
| --- | --- |
| `$_COOKIE['language']='ko'` + `Cookie::setKeyStore('language','language')` | `\Limepie\get_language()` 가 쿠키를 읽는다. 없으면 fatal. (env `LIMEPIE_LANG` 로 변경 가능) |
| `$_SESSION['nonce']=''` | search/tinymce 등 필드가 `<script nonce="...">` 에 세션 CSP nonce 를 삽입한다. 실서버는 요청마다 난수 — 베이스라인은 빈 값으로 고정. |
| `$_SERVER['QSA']=''` | 버튼 href 에 현재 요청 query string 을 덧붙이는 경로. 요청이 없으므로 빈 값. |
| ext-yaml polyfill | 로컬 PHP 에 ext-yaml 이 없어 `yaml_parse_file`/`yaml_parse` 를 symfony/yaml 로 정의. 스펙 파싱은 `\Limepie\yml_parse_file()` 경유 → `Form\Parser::processForm()` 이 `$ref`/`$after`/`$merge`/언어 키를 legacy 와 동일하게 처리한다. |

## 출력의 비결정 토큰 (정규화 비교 필수)

Limepie 출력은 실행마다 달라지는 난수 토큰을 포함한다. 기준은 **원본 그대로** 저장한다
(multiple 그룹에서 `name="...[__<id>__]..."` 와 `data-uniqid="__<id>__"` 가 같은 id 를 공유하는
상관관계가 스펙의 일부이므로, 저장 시점 마스킹은 정보를 파괴한다).
기준과 비교할 때는 양쪽 모두 아래 정규화를 거쳐라. 토큰 값 자체를 비교 대상으로 삼지 마라.

| 토큰 | 출처 | 예 |
| --- | --- | --- |
| `__<13hex>__` | `Fields::uniqid()` — `data-uniqid`, multiple 그룹 name placeholder | `__695a6554bcb28__` |
| `<prefix><13hex>` | `tinymce*`, `f*`, `element_*`, `tagify*`, `blank_*` 등 필드 id (참조 스크립트 포함) | `tinymce6a2be760ce5d1` |
| `choice-<key>-<5자>-<n>` | `Choice` 라디오 id (`genRandomString(5)`, charset `[a-hj-km-np-z2-9]`) | `choice-account_type-6whgq-1` |
| `<class>_<5자>` | `display_switch` 클래스 접미사 (`ElementVisibilityManager`) | `business_number_e5c56` |

상관관계 보존 마스킹 — 검증된 전체 레시피 (각 토큰을 등장 순서대로 `U1`/`C1`/`T1`... 로 치환):

```sh
perl -0777 -pe '
  s/(?<=tinymce)[0-9a-f]{13}(?![0-9a-f])/$m{$&} \/\/= "U".(++$i)/ge;
  s/(?<![0-9a-f])[0-9a-f]{13,14}(?![0-9a-f])/$m{$&} \/\/= "U".(++$i)/ge;
  s/(choice-[A-Za-z_0-9-]+-)([a-hj-km-np-z2-9]{5})(-\d)/$1.($c{$2}\/\/="C".(++$j)).$3/ge;
  s/(_)([a-hj-km-np-z2-9]{5})(?![0-9a-zA-Z_-])/$1.($t{$2}\/\/="T".(++$k))/ge
' file.html
```

규칙별 주의점 — 줄을 빼지 마라:

1. `tinymce<13hex>` 는 별도 1행이 필수다. 접두사 `tinymce` 가 hex 문자(`c`,`e`)로 끝나
   일반 hex 룰의 lookbehind `(?<![0-9a-f])` 가 절대 매치하지 않는다.
2. choice 룰의 키 문자클래스에 대문자(`A-Z`)를 포함하라. multiple 그룹 안 choice id 는
   1번 룰 적용 후 `choice-...-__U61__-is_close--xxxxx-1` 처럼 마스킹 토큰(`U`)을 포함한다.
3. `_<5자>` 룰(display_switch 클래스)은 onchange 핸들러 JS 문자열 내부에도 등장하므로
   따옴표/공백 경계로 한정하지 마라 — negative lookahead 경계를 쓴다.

이 레시피를 두 독립 실행 결과에 적용하면 byte-identical 함을 기준 7개 전부에서 검증했다.

## 케이스별 기록

### multiple-test.html — multiple 그룹 출력 규약의 최초 캡처

`multiple: true` 그룹에 대한 legacy 출력 규약. 다른 렌더러는 이 규약을 그대로 따라야
한다 — 추측으로 변형하지 마라.

- name 속성: 행마다 uniqid placeholder 삽입 — `form[contacts][__<13hex>__][name]`.
  중첩 multiple 도 단계마다 각자 placeholder — `...[departments][__a__][teams][__b__][members][__c__][member_name]`.
- `data-rule-name` 은 placeholder 없이 빈 브래킷 — `contacts[][name]`.
- wrapper layer name 은 dot 표기 — `form.contacts.__<13hex>__.name-layer`.
- 행 버튼: `<span class="btn-group input-group-btn">` 안에 `btn-plus`/`btn-minus`
  (+ `sortable: true` 면 `btn-move-up`/`btn-move-down` 추가). 라벨은 전부 `&nbsp;`.
- 스펙의 `add_button_label`/`remove_button_label` 은 legacy 가 **렌더하지 않는다**
  (출력에 0회 등장). 이 라벨을 출력에 추가하지 마라.

### ProductNft.html — YAML 중복 키 dedup 사본으로 렌더

`tests/fixtures/specs/ProductNft.yml` 은 문자 그대로의 중복 키 2곳을 포함한다:

1. 222–226행: `is_sale.description` 이 두 번 정의 (3줄짜리 1차, 2줄짜리 2차)
2. 890–891행: `display_target_condition_class` 안의 `1: ""` 두 번 (값 동일)

legacy ext-yaml(libyaml) 은 last-wins 로 조용히 허용하고, symfony/yaml v8 은
`ParseException` 을 던진다. 스펙 파일은 수정하지 않는다 — `generate-all.sh` 가 임시
사본에서 "지는 쪽"(앞선 중복) 줄만 제거해 **ext-yaml 이 파싱했을 트리와 동일한** 입력을
만들어 렌더한다. 줄 번호 가드가 있어 스펙이 변하면 스크립트가 중단된다.

`$ref: OptionMultiplexable.yml` 은 스펙 파일 디렉터리 기준으로 정상 해석된다
(임시 사본 디렉터리에 fragment 도 함께 복사).

### OptionMultiplexable.html — 단독 렌더 불가 (기준 없음)

`OptionMultiplexable.yml` 은 ProductNft 에 `$ref` 로 포함되는 host 의존 fragment 다.
필드들이 `display_target: common.is_quantity` 등 **host 폼의 키 경로**를 참조하므로
단독 렌더는 legacy Limepie 자체가 실패한다:

```
Limepie\Exception: #1 not found key common.is_quantity
  Fields::getDefaultByDot ← Group::processSingleTarget (display_target 평가)
```

가짜 host 를 만들어 단독 기준을 조작하지 마라. 이 fragment 의 기준 커버리지는
`ProductNft.html` 내 포함 렌더다 (`option_multiplexable[items][...]` 6개 필드 전부 포함).
`generate-all.sh` 는 매회 단독 렌더를 시도하므로, 미래에 렌더 가능해지면 자동 생성된다.

### compare/php-output.html 과의 관계

`compare/php-output.html` 의 form 부분은 커밋 `a69a23f` 시점 캡처 기준으로 본 파이프라인의
`product-form.html` 과 **uniqid 마스킹 후 byte-identical** 임을 검증했다. 단, 이후 커밋
`64b8e8c` 에서 캡처 파일의 wrapper 클래스 3곳(`border p-3 mb-3`)이 손으로 제거되었다
(uniqid 가 그대로인 채 클래스만 삭제 — 재캡처가 아닌 수기 편집). 실제 Limepie 는 이 클래스를
출력하므로 기준은 출력 그대로 유지한다. 캡처 파일 쪽이 단일진실이 아니다 — 기준을 캡처에
맞춰 고치지 마라.
