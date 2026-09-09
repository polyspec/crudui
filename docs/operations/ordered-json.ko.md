# JSON 문서 순서 검증

[English](ordered-json.md). [폼 런타임 계약](../spec/form-runtime.ko.md)은 필요한
데이터 형태와 순서를 정의합니다. [기능 상태](../features.ko.md)는 검증과 런타임
배포를 구분해 기록합니다.

검사는
[OrderedJSON](https://github.com/ordered-json/ordered-json/tree/7a2b4682f002f73b6c44e77012d39ff199c9331d)
공통 커밋 `7a2b4682f002f73b6c44e77012d39ff199c9331d`의 명시적인 체크아웃 경로와
다음 커밋의 구현 하위 모듈 다섯 개를 사용합니다.

| 하위 모듈 | 커밋 |
| --- | --- |
| `js` | `d3b1f3473ce2645c79c772940df622c4d8b0bca7` |
| `rust` | `266ab5c95d7095342521701994462c9f057cde1b` |
| `go` | `2588cbd59b442e9c7231a1b8d945a16142851141` |
| `php` | `2571dacad60affcc299972474b53f2b9e6848967` |
| `php-extension` | `1dcb0cff184a0618de810febfe651a50b2a06cd0` |

검사기는 절대 경로와 초기화된 하위 모듈을 요구하며, 실행 전후에 정확한 리비전과
소스 변경 여부를 확인합니다. PHP는 `OrderedJson` 네임스페이스를 사용하며,
네이티브 대상은 `php-extension`이고 `ordered_json.so`를 로드합니다.

`ORDERED_JSON_SOURCE`를 체크아웃의 절대 경로로 설정합니다. Node, PHP, PHP 확장
빌드 도구, Go, Rust, Python이 설치된 환경에서 CRUDUI 루트를 기준으로 실행합니다.

```sh
ORDERED_JSON_SOURCE=/absolute/path/to/ordered-json
git clone --no-checkout https://github.com/ordered-json/ordered-json "$ORDERED_JSON_SOURCE"
git -C "$ORDERED_JSON_SOURCE" checkout 7a2b4682f002f73b6c44e77012d39ff199c9331d
git -C "$ORDERED_JSON_SOURCE" submodule update --init --recursive
python3 -m unittest discover -s tests/ordered-json -p 'test_*.py'
python3 "$ORDERED_JSON_SOURCE/scripts/verify.py"
python3 tests/ordered-json/check.py "$ORDERED_JSON_SOURCE"
make docs-check
```

체크아웃이 이미 있으면 clone 명령을 생략합니다. 단위 검사는 실패 처리와 불완전한
결과 검출을 확인합니다. 공식 검사기는 어댑터와 PHP
확장을 빌드하고 다섯 구현에서 공식 예제 17개와 공통 문법 사례 98개를 실행합니다.
공통 저장소의 전체 검증 기록이나 PIE 검증 기록을 교체하지 않습니다.
CRUDUI 검사기는 JSON 문서 10개를 다섯 구현의 파싱·직렬화·재구성 API로
처리합니다. 독립된 Python 디코더가 객체 키·값 쌍과 숫자 토큰을 유지해 비교합니다.
검사기는 객체 멤버를 정렬하지 않고 순서를 포함한 전체 트리를 비교합니다.
`scripts/registry.py`로 저장소 경로를 확인하고, 선택한 어댑터를 빌드하고,
실행 명령을 가져옵니다. 두 검사는 순서대로 실행합니다. 같은 체크아웃에서
일반 확장 빌드와 PIE 결과물 검사를 동시에 실행하면 안 됩니다.

보고서는 `.verification/ordered-json/ordered-json-<timestamp>.json`에 저장합니다.
공통 저장소와 하위 모듈 리비전, 검사기·사례 해시, 런타임 버전, 네이티브 모듈
해시, 빌드 경고와 개별 결과를 포함합니다. 이전 보고서는 유지합니다. 다섯 구현과
결과 50개가 모두 필요합니다. 응답 누락, 잘못된 출력, 프로세스 실패나 사례 실패는
실패 보고서와 0이 아닌 종료 상태를 생성합니다. 검증 중 소스나 결과물이 변경되어도
검사가 실패합니다.

추가·복사·저장 후 키 교체 사례는 JSON 고정 데이터입니다. 전송 표현을 검사하며,
폼 버튼이나 데이터베이스 작업의 실행을 검사하지는 않습니다. 외부에 보존한 예제의 전송
모듈은 JSON 요청·응답과 저장소 파일에 이 처리기를 사용합니다. 처리기는 `Value` 노드를 반환하며,
JavaScript 객체 멤버는 `Map`입니다. 폼 세션은 일반 객체 데이터를 받습니다.
이 맵을 일반 JavaScript 객체로 변환하면 숫자 형태 멤버의 순서가 변경되므로
폼 변환은 그런 변경을 거부합니다.
현재 구분자를 포함한 13자리 행 키는 정수 인덱스 속성이 아니므로 기존 세션에서도
삽입 순서를 유지합니다.

폼과 JSON 전송은 같은 검증기와 저장소를 실행합니다. 런타임 연동은
[브라우저·PHP 영속 저장 검사](verification.ko.md)로 확인합니다. 두 전송 방식, 실제
입력·버튼 조작, 잘못된 요청 거부, 같은 저장 데이터와 새 재로드를 실행합니다.
처리기만 검사한 결과와 이 연동 결과는 별도로 기록합니다.
