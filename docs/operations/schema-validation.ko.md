# 스키마 검증

[English](schema-validation.md).

npm 의존성을 설치한 후 저장소 루트에서 `make docs-schema`를 실행합니다.
명령은 Ajv로 `schema/crudui.schema.json`을 컴파일하고 공유 폼·목록 고정 데이터를
검사합니다. 스키마가 잘못되었거나 사례 결과가 다르면 실패합니다.
스키마와 기대 결과를 수정하지 않습니다.

JSON Schema는 허용하는 선언 형태를 정의합니다.
`packages/validator-ts/src/schema.ts`의 TypeScript 선언은 이에 대응하는 작성용
타입을 제공합니다. 선언 계약을 변경하면 둘을 함께 수정하고 검증기 테스트,
CLI 검사와 `make docs-schema`를 실행합니다. `make docs-clean`은 스키마 기준을
보존합니다.
