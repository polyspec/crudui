# 검증기 명령행 요청

[English](README.md).

`cases.json`은 모든 검증기 명령행 어댑터(JavaScript, PHP, Go, Rust)가 검증 전후에 요청에 어떻게 응답하는지
정의합니다. 사례마다 `name`, `note`, 표준 입력 원문 `input`, `expected: { exit, output }`이 있으며 `output`은
표준 출력에 쓰는 JSON 객체 전체입니다.

잘못된 요청은 `{ "error" }`와 함께 종료 코드 `1`로 끝납니다. 규칙은 다음 순서로 검사합니다.

| 규칙 | 메시지 |
| --- | --- |
| 표준 입력이 올바른 JSON | `Request must be valid JSON` |
| 요청이 객체 | `Request must be an object` |
| `spec`이 객체 | `Request spec must be an object` |
| `mode`가 없거나 `form`, `list`, `detail` | `Unsupported validation mode` |
| `files`가 없거나 `null`이거나 객체 | `Request files must be an object` |
| `files`의 모든 항목이 객체 | `Request files must contain objects` |
| `basepath`가 없거나 `null`이거나 문자열 | `Request basepath must be a string` |

있으면서 객체가 아닌 폼 데이터는 입력 실패(종료 코드 `2`)입니다. 목록과 상세 모드는 `data`를 무시합니다. 교차
검증 콘솔 검사 `validator-cli-requests.test.mjs`가 네 어댑터에서 모든 사례를 실행합니다.
