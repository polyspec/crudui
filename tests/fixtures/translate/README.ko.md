# 변환 고정 데이터

[English](README.md).

`cases.json`은 [`legacy` 스키마](../../../docs/spec/legacy-schema.ko.md)가 설명하는 `legacy` 모듈의 필드
모델을 [명세 구조](../../../docs/spec/schema.ko.md)로 변환하는 사례입니다. 변환은 TypeScript에서만
실행하며, 다른 런타임은 변환한 명세를 검증하고 렌더링합니다. 각 사례는 `name`, `note`, `legacy`,
`schema`, `notes`, `roundtrip`을 제공합니다. `notes`의 모든 항목은 `path`, `legacyKey`, `reason`,
`detail`을 가집니다. `roundtrip`은 `reversible`을 가지며, 되돌릴 수 있는 사례는 `lossless`와 다시 변환한
선언 `back`도 기록합니다.

표시 대상과 전환, 디자인 노드, 검증 규칙, 조건부 필수 입력, 동작, 언어와 반복 설정, 합성 패치, 타입에 따른
옵션, `x`로 시작하는 주석 키, 정적 선택지와 원본을 가진 선택지, 폼 버튼과 동작, 예약된 필드 이름, 비어
있거나 null인 값의 제거를 검사합니다.

## 비교

[TypeScript 적합성 검사](../../../packages/validator-ts/src/legacy/translate/translate.conformance.test.ts)는
`legacy`를 다시 변환해 깊이 같은 `schema`와 엄격히 같은 `notes` 목록을 요구합니다. 모든 `schema`는
[메타 스키마](../../../schema/crudui.schema.json)를 통과해야 하며 어떤 깊이에도 금지 키나 `x`로 시작하는
키가 없어야 합니다. 되돌릴 수 있는 사례는 기록을 만들지 않아야 하고, 명세를 다시 변환한 결과가 `legacy`와
`roundtrip.back` 모두와 같아야 합니다. 되돌릴 수 없는 사례는 `reason`, `path`, `legacyKey`를 가진 기록을
하나 이상 만들어야 하며 `lossless`를 기록하지 않아야 합니다.

`npm run spec:schema`로 실행하는 [`check-schema.mjs`](../../../scripts/check-schema.mjs)도 모든 `schema`가
폼 메타 스키마를 통과하기를 요구합니다.

## 재생성

저장소 루트에서 실행합니다.

```sh
node_modules/.bin/tsx tests/fixtures/translate/generate.ts > tests/fixtures/translate/cases.json
```

생성기는 변환기를 실행해 결과, 기록, 왕복 결과를 기록합니다. 변환한 명세에 금지 키가 있거나 되돌릴 수 있는
사례가 그대로 되돌아오지 않으면 중단됩니다. 변경을 반영하기 전에 두 스키마와 비교하여 검토합니다. 재생성만으로
검증이 완료되지는 않습니다.
