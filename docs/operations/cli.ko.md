# 스펙 CLI

[English](cli.md).

비공개 `@crudui/cli` 워크스페이스는 `describe`, `list-widgets`, `check`,
`explain`을 제공합니다. 명령이나 테스트를 실행하기 전에 저장소 루트에서
의존성을 설치하고 validator를 빌드합니다.

```sh
npm ci
npm run build:validator
```

CLI는 `tsx`로 실행하며 import한 생성기 모듈은 빌드된 validator 패키지를
사용합니다. validator 소스를 변경하면 다시 빌드합니다. CI도 같은 순서로
설치·빌드·테스트를 실행합니다.

저장소 루트에서 명령을 실행합니다.

```sh
node --import tsx packages/cli/bin/crudui.mjs describe --json
node --import tsx packages/cli/bin/crudui.mjs list-widgets --json
node --import tsx packages/cli/bin/crudui.mjs check packages/cli/test/fixtures/valid-leaf-type.yml
node --import tsx packages/cli/bin/crudui.mjs explain packages/cli/test/fixtures/valid-leaf-type.yml --lang en
```

| 명령 | 입력과 출력 |
| --- | --- |
| `describe` | 소스 등록부·스키마·표현식 계약에서 기능 목록을 생성합니다. 기본 출력은 JSON이며 `--md`는 Markdown을 선택합니다. |
| `list-widgets` | 위젯 이름·레이아웃·별칭을 반환합니다. `--json`은 JSON 배열을 선택합니다. |
| `check <path>` | JSON 또는 YAML을 파싱하고 스키마·금지 키를 검사한 뒤 필드를 조합하고 말단 위젯 타입을 검사합니다. `{ ok, errors }`를 반환합니다. |
| `explain <path>` | JSON 또는 YAML 스펙을 설명합니다. `--lang en`은 영어를 선택하며 기본값은 한국어입니다. 입력 데이터를 검증하지 않습니다. |

`check` 오류는 `path`, `reason`과 선택적 `key`를 포함합니다. 해결되지 않은 조합은
오류이며 조합 전 원본 입력 검사는 이를 대체하지 않습니다. 명령에는 외부 참조
파일 집합 옵션이 없습니다. 외부 조합 입력이 필요하면 명시적 로더 또는 파일
집합을 지정한 [검증 API](validation.ko.md)를 사용합니다.

명령 성공 시 종료 코드는 0입니다. `check` 실패 또는 실행 오류는 1,
알 수 없는 하위 명령은 2를 반환합니다. `validate`, `render`, `scaffold`는
등록된 CLI 명령이 아닙니다. 렌더링은 [폼 API](forms.ko.md)를 사용합니다.

기능 목록은 `meta`, `widgets`, `layouts`, `rules`, `slots`, `buckets`,
`forbiddenKeys`, `grammar`, `classification`, `matrix`, `list`를 포함합니다.
전체 형식은 [DescribeResult](../../packages/cli/src/describe.ts)에 정의합니다.
위젯이나 규칙 목록의 별도 복사본을 관리하지 않습니다.

`npm test --workspace @crudui/cli`로 목록 일치·정적 검사·설명을 검사합니다.
구현과 배포 결과는 [기능 상태](../features.ko.md)에서 관리합니다.
