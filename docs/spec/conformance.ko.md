# 적합성 증거

[English](conformance.md).

[`contracts/features.json`](../../contracts/features.json)은 모든 런타임을 재는 기준입니다. 각 기능은
지원하는 런타임(`pass`, `partial`, `unsupported`)과 그 기능을 증명하는 공용 fixture를 선언합니다.
매니페스트의 `fixtures` 목록은 모든 fixture를 등록합니다. `cases.json` 가족, `cases`를 선언하거나 사례
목록을 내보내는 export를 지정한 모듈 fixture, 또는 사례가 없는 공용 입력인 `corpus`입니다.

## 런타임 키

| 키 | 구현 |
| --- | --- |
| `javascript` | `@crudui/validator`와 `@crudui/generator-core` 모델 |
| `javascript-html` | `@crudui/generator-html` 문자열 렌더러 |
| `javascript-dom` | `@crudui/generator-html` 마크업 위의 `@crudui/generator-core` DOM 바인딩 |
| `react`, `vue`, `svelte` | 프레임워크 패키지 |
| `php`, `go`, `rust` | 서버 라이브러리 |
| `php-native` | PHP C 확장 |

JavaScript는 모델과 문자열 렌더러가 별도 패키지이므로 서버 출력에 키가 두 개입니다. PHP, Go, Rust는
둘을 한 라이브러리에 담으므로 모델 기능과 HTML 기능을 한 키로 증명합니다.

## 증거

공용 fixture 사례를 실행하는 테스트는 그 사례가 증명하는 기능마다 한 줄
`{"feature", "fixture", "runtime", "case", "passed"}`를 기록합니다. `passed`는 그 사례의 모든 검증이
성공했을 때만 참입니다. 기록기는
[`tests/conformance/evidence.mjs`](../../tests/conformance/evidence.mjs),
[`tests/conformance/evidence.php`](../../tests/conformance/evidence.php), Go 패키지
`validator/internal/conformance`, Rust 테스트 모듈 `tests/common`입니다. `CRUDUI_CONFORMANCE_EVIDENCE`가
디렉터리를 지정할 때만 기록합니다.

[`scripts/check-conformance.mjs`](../../scripts/check-conformance.mjs)는 그 디렉터리를 읽고 다음 경우에
실패합니다.

- 지원 런타임에 기능이 지정한 fixture 사례의 증거가 없거나 실패한 증거가 있을 때
- 기준이 선언하지 않은 기능, fixture, 런타임, 사례의 증거가 있을 때(예: `unsupported`로 선언한 런타임의 테스트)
- `tests/fixtures` 아래 디렉터리에 등록된 fixture가 없거나, 등록된 사례 fixture를 증명하는 기능이 없을 때
- 기능이 등록된 사례 fixture가 아닌 fixture를 지정할 때

서버 런타임은 [`tests/native-generators/run.mjs`](../../tests/native-generators/run.mjs)가 JavaScript
기준 출력과 바이트 단위로 비교합니다. 클라이언트 렌더러는 fixture의 정규화된 HTML과 비교하며, 정규화는
프레임워크 자체가 만드는 차이에만 적용합니다.

`make conformance`는 디렉터리를 비우고 증거를 기록하는 모든 테스트를 실행한 뒤 검사를 실행합니다.
CI는 작업마다 증거를 올리고 모든 증거에 대해 검사를 한 번 실행합니다.
