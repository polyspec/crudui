# 스키마 생성

[English](schema-generation.md).

npm 의존성을 설치한 후 저장소 루트에서 `make docs-schema`를 실행합니다.
이 명령은 `packages/validator-ts/src/types.ts`를 읽고 `schema/crudui.schema.json`을
생성한 후 Ajv로 컴파일하고 예제 명세를 검사합니다. API 문서를 생성한 후
`make docs-site`로 문서 사이트를 빌드합니다.

스키마 생성기는 자체 TypeScript 컴파일러를 사용합니다. 검증기의 컴파일러 설정은
생성기와 패키지 컴파일러에서 모두 허용하는 옵션을 사용해야 합니다. 공통 컴파일러
옵션을 변경하면 `npm run typecheck -w @crudui/validator`와 `make docs-schema`를
실행합니다. 설정 오류를 우회하기 위해 타입 검사를 끄지 않습니다.
