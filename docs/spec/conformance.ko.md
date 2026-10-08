# 적합성 증거

[English](conformance.md).

[`contracts/features.json`](../../contracts/features.json)은 모든 런타임을 재는 기준입니다. 각 기능은
지원하는 런타임(`pass`, `partial`, `unsupported`)과 그 기능을 증명하는 공용 fixture를 선언합니다.
매니페스트의 `fixtures` 목록은 모든 fixture를 등록합니다. `cases.json` 가족, `cases`를 선언하거나 사례
목록을 내보내는 export를 지정한 모듈 fixture입니다.

## 런타임 키

| 키 | 구현 |
| --- | --- |
| `javascript` | `@polyspec/crudui-validator`와 `@polyspec/crudui-generator-core` 모델 |
| `javascript-html` | `@polyspec/crudui-generator-html` 문자열 렌더러 |
| `javascript-dom` | `@polyspec/crudui-generator-html` 마크업 위의 `@polyspec/crudui-generator-core` DOM 바인딩 |
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
- 기준이 선언하지 않은 기능, fixture, 런타임, 사례의 증거가 있을 때(예: `unsupported`로 선언한 런타임의 테스트, `partial` 런타임의 fixture 밖 사례)
- `tests/fixtures` 아래 디렉터리에 등록된 fixture가 없거나, 등록된 사례 fixture를 증명하는 기능이 없을 때
- 기능이 등록된 사례 fixture가 아닌 fixture를 지정할 때

`partial` 런타임은 기록한 사례로 측정합니다. 기록된 사례마다 통과해야 하고 요구되는 사례는 없습니다. 공용 fixture가
부분 런타임이 지원하는 사례를 정하지 않기 때문입니다.

## Suite 실행

빠진 사례만으로는 그 suite가 실패했는지, 끝나지 않았는지, 실행되지 않았는지 알 수 없으므로, 증거를 기록하는
suite의 실행은 증거 디렉터리의 `runs/`에 실행 기록도 남깁니다.
[`tests/conformance/run-suite.mjs`](../../tests/conformance/run-suite.mjs)는
[`scripts/kit/run-tests.mjs`](../../scripts/kit/run-tests.mjs)로 시작하는 suite의 테스트 명령 기록을,
[`tests/native-generators/run.mjs`](../../tests/native-generators/run.mjs)는 자신의 기록을
[`tests/conformance/runs.mjs`](../../tests/conformance/runs.mjs)로 씁니다. 기록
`{"program", "tool", "cwd", "args", "started", "status"}`는 실행이 시작할 때 `status`를 `null`로 써지고,
process가 끝날 때 종료 상태로 다시 써지므로 멈춘 실행은 `null`을 유지합니다. Python suite는
[`tests/conformance/runner.py`](../../tests/conformance/runner.py)로 기록을 쓰며, 각 기록의 program은 그 runner
자신이므로 suite를 실행하는 Python 실행 파일에 따라 달라지지 않습니다.

검사의 `evidenceSuites`는 suite마다 그것을 실행하는 명령과 증명하는 런타임을 선언합니다. 증거가 빠졌거나
실패한 기능, fixture, 런타임마다 검사는 그 런타임을 증명하는 모든 suite를 상태와 함께 적습니다. 명령에 맞는
기록이 없으면 `did not run`, 기록에 상태가 없으면 `did not finish`, 그 밖에는
`ended with failure (exit <status>)`나 `passed`입니다. 맞는 명령마다 가장 최근 기록이 결정하고, 여러 명령으로
실행되는 suite는 그중 가장 나쁜 상태를 가집니다. 기능이 지원하는 모든 런타임은 선언된 suite가 증명합니다.

서버 런타임은 [`tests/native-generators/run.mjs`](../../tests/native-generators/run.mjs)가 JavaScript
기준 출력과 바이트 단위로 비교합니다. 클라이언트 렌더러는 fixture의 정규화된 HTML과 비교하며, 정규화는
프레임워크 자체가 만드는 차이에만 적용합니다.

`make conformance`는 디렉터리를 비우고 증거를 기록하는 모든 테스트를 실행한 뒤 검사를 실행합니다.
CI는 작업마다 고유한 artifact 이름으로 증거를 올리고 모든 증거에 대해 검사를 한 번 실행합니다.
conformance job은 artifact마다 별도 디렉터리에 내려받고, 검사는 디렉터리와 그 하위 디렉터리의 증거 파일과
`runs/` 기록을 읽으므로 한 job의 파일이 다른 job의 같은 이름 파일을 덮어쓰지 않습니다.
