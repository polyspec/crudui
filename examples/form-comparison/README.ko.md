# CRUDUI 폼 비교

[English](README.md).

수정한 원본 렌더러에 예제 행 연산과 캐시 바인딩을 연결한 구현과 현재 13자리
런타임에 동일한 키 데이터를 제공해 비교합니다. 수정 전 원본 키 렌더러와 이전 배열
진단도 선택할 수 있습니다. 사용자 제출은 전송 전에 기존 JavaScript 검증기를
실행하며 PHP는 독립적으로 검증합니다.
React, Vue, Svelte가 실제 폼을 PHP에 제출하고 JSON에 저장한 회사, 스토어,
부서 레코드를 다시 불러옵니다.

저장소 루트에서 실행합니다.

```sh
node examples/form-comparison/run.mjs start
```

[http://localhost:4317](http://localhost:4317)을 엽니다.
[운영 문서](../../docs/operations/form-comparison.ko.md)는 검증과 종료를 설명합니다.
[계약](../../docs/spec/form-comparison.ko.md)은 소스 분리와 자료구조를 정의합니다.
[기능 상태](../../docs/features.ko.md)는 실제 결과와 제한을 기록합니다.
