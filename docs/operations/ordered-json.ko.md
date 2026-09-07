# JSON 문서 순서 검증

[English](ordered-json.md). [폼 비교 예제 계약](../spec/form-comparison.ko.md)은 필요한
데이터 형태와 순서를 정의합니다. [기능 상태](../features.ko.md)는 검증과 런타임
배포를 구분해 기록합니다.

검사는
[ordered-json](https://github.com/ordered-json/ordered-json/tree/deb1b354da845e4c44d1e35c28c77bdb02ec174b)
커밋 `deb1b354da845e4c44d1e35c28c77bdb02ec174b`의 명시적인 체크아웃 경로를
사용합니다. 이 리비전의 패키지 이름은 `sortjson`입니다. 다른 리비전이나 수정된
소스는 검사에서 거부합니다.

`ORDERED_JSON_SOURCE`를 체크아웃의 절대 경로로 설정합니다. Node, PHP, PHP 확장
빌드 도구, Go, Rust, Python이 설치된 환경에서 Polyspec 루트를 기준으로 실행합니다.

```sh
ORDERED_JSON_SOURCE=/absolute/path/to/ordered-json
git clone https://github.com/ordered-json/ordered-json "$ORDERED_JSON_SOURCE"
git -C "$ORDERED_JSON_SOURCE" checkout deb1b354da845e4c44d1e35c28c77bdb02ec174b
python3 "$ORDERED_JSON_SOURCE/scripts/test.py" --build-extension
python3 examples/form-comparison/check-ordered-json.py "$ORDERED_JSON_SOURCE"
make docs-check
```

체크아웃이 이미 있으면 clone 명령을 생략합니다. 첫 Python 명령은 PHP 확장을
빌드하고 다섯 구현에서 처리기의 공식 예제 17개와 문법 사례 98개를 실행합니다.
두 번째 명령은 Polyspec JSON 문서 10개를 다섯 구현의 파싱·직렬화·재구성 API로
처리합니다. 독립된 Python 디코더가 객체 키·값 쌍과 숫자 토큰을 유지해 비교합니다.
검사기는 객체 멤버를 정렬하지 않고 순서를 포함한 전체 트리를 비교합니다.

보고서는 `.form-comparison/results/ordered-json-<timestamp>.json`에 저장합니다.
소스 리비전, 검사기·사례 해시, 개별 결과를 포함합니다. 이전 보고서는 유지합니다.
사례가 실패하면 종료 상태 1을 반환합니다.

추가·복사·저장 후 키 교체 사례는 JSON 고정 데이터입니다. 전송 표현을 검사하며,
폼 버튼이나 데이터베이스 작업의 실행을 검사하지는 않습니다. 실행 중인 실험
환경은 여전히 표준 JSON 함수를 사용합니다. 처리기는 `Value` 노드를 반환하며,
JavaScript 객체 멤버는 `Map`입니다. 폼 세션은 일반 객체 데이터를 받습니다.
이 맵을 일반 JavaScript 객체로 변환하면 숫자 형태 멤버의 순서가 변경됩니다.
현재 구분자를 포함한 13자리 행 키는 정수 인덱스 속성이 아니므로 기존 세션에서도
삽입 순서를 유지합니다.

런타임 연동을 변경하면 [브라우저·PHP 영속 저장 검사](form-comparison.ko.md)를 실행합니다.
처리기만 검사한 결과는 런타임 연동의 검증 근거가 아닙니다.
