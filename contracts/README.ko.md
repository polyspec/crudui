# CRUDUI 계약 manifest

[English](README.md).

[`features.json`](features.json)은 각 기능과 담당 패키지, 입력, 출력, 상태 변경,
오류, 지원 행렬, 테스트, 문서를 연결합니다. manifest는 widget이나 검증
목록을 복사하지 않습니다. 해당 목록은 실제 registry와 schema에서 계속 생성합니다.

저장소 루트에서 manifest를 검사합니다.

```sh
npm run manifest:check
```

검사는 manifest 구조, 패키지 경로, 패키지 진입점, fixture·테스트·문서 연결을 확인합니다.

각 패키지는 `entries`에 `package.json` `exports`의 모든 JavaScript 진입점(`"."`과 코드를 담은
다른 하위 경로. 스타일시트와 `package.json`은 코드가 아닙니다)을 `visibility`, 그리고 코드 단위 순서로
정렬한 값 export 목록과 함께 선언합니다. 타입은 적지 않습니다. `public` 진입점은 애플리케이션
API입니다. `internal` 진입점은 CRUDUI 자체 패키지만 사용하며 애플리케이션에는 지원하지 않습니다.
검사는 TypeScript 컴파일러로 각 진입점 소스 파일(`./dist/<name>.js`는 `src/<name>.ts`에서 빌드)의
값 export를 별칭과 다시 내보내기를 따라 읽고, 다음 경우 실패합니다.

- `package.json` 코드 진입점에 manifest 항목이 없거나, manifest 항목에 해당하는 `package.json`
  코드 진입점이 없음
- 값 export가 선언 목록과 어느 방향으로든 다르거나, 해석할 수 없는 export가 있거나, 목록이
  정렬되지 않음
- 구현 완료 기능의 `signature`에 적은 함수가 담당 패키지의 공개 `"."` 목록에 없음
- 구현 완료 기능의 `errors`에 적은 오류 클래스(`Error`로 끝나는 이름)가 JavaScript 기본 오류도
  아니고 어느 CRUDUI 패키지의 공개 `"."` 목록에도 없음
- `packages/` 아래 CRUDUI 패키지 코드가 아닌 파일이 `internal` 진입점을 가져옴. 예제, 테스트,
  문서와 패키지 README는 공개 진입점만 사용합니다.
- `packages/` 아래 패키지의 파일이 다른 패키지의 파일을 상대 경로로 가져옴(import, export,
  `require`, 동적 import, Vitest 모듈 mock). 패키지는 다른 패키지를 이름으로 지정한 진입점으로만
  사용합니다.

[`tests/build/contract-manifest.test.mjs`](../tests/build/contract-manifest.test.mjs)는 각 실패를
합성 저장소에서 증명하고 이 저장소에 검사를 실행합니다.
CLI는 같은 계약을 도구가 읽을 수 있는 JSON 또는 Markdown으로 출력할 수 있습니다.
