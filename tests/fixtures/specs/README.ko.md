# 벤치마크 명세

[English](README.md).

이 묶음은 공유 사례가 아니라 실제 규모의 폼 선언을 담습니다. 파일은
[`legacy` 스키마](../../../docs/spec/legacy-schema.ko.md)가 설명하는 `legacy` 모듈의 필드 모델을
사용합니다.

- [`ProductNft.yml`](ProductNft.yml)은 중첩 그룹, 반복 필드, 조건 표현식, 표시 대상, `$ref`를 가진 큰 상품
  폼입니다.
- [`OptionMultiplexable.yml`](OptionMultiplexable.yml)은 합성에도 쓰이므로 별도 파일로 둔 반복 옵션
  그룹입니다.
- [`ProductNft.analysis.md`](ProductNft.analysis.md)는 두 파일의 필드 타입, 검증 규칙, 조건 표현식, 표시
  패턴, 전환 클래스, 참조 수를 세고 구조와 테스트 고려 사항을 정리합니다.

## 비교

이 파일과 결과를 비교하는 검사는 없습니다. `packages/validator-ts`에서 `npm run bench`로 실행하는
[검증 벤치마크](../../../packages/validator-ts/benchmarks/validation.bench.ts)는 `ProductNft.yml`을
`legacy` 검증기로 불러와, 생성한 올바른 데이터·잘못된 데이터·최소 데이터로 생성과 검증 시간을 측정합니다.
파일을 불러올 수 없으면 벤치마크는 내장된 작은 명세를 사용합니다. `OptionMultiplexable.yml`과
`ProductNft.analysis.md`를 불러오는 코드는 없습니다.

## 재생성

생성기는 없으며 파일은 직접 작성합니다. 두 선언 중 하나가 바뀌면 `ProductNft.analysis.md`를 갱신하고,
벤치마크 데이터의 필드 이름을 `ProductNft.yml`과 일치시킵니다.
