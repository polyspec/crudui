# @crudui/cli

[English](README.md).

스펙 목록·정적 검사·설명을 제공하는 비공개 워크스페이스입니다.
소스 등록부와 스키마를 읽습니다. CLI는 `tsx`로 실행하며 빌드된 validator
패키지가 필요합니다.

저장소 루트에서 실행합니다.

```sh
npm ci
npm run build:validator
node --import tsx packages/cli/bin/crudui.mjs describe --json
npm test --workspace @crudui/cli
```

명령·입력·출력·종료 코드는 [CLI 절차](../../docs/operations/cli.ko.md)를
참조합니다.
