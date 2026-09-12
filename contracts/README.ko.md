# CRUDUI 계약 manifest

[English](README.md).

[`features.json`](features.json)은 각 기능과 담당 패키지, 입력, 출력, 상태 변경,
오류, 지원 행렬, 테스트, 문서를 연결합니다. manifest는 widget이나 검증
목록을 복사하지 않습니다. 해당 목록은 실제 registry와 schema에서 계속 생성합니다.

저장소 루트에서 manifest를 검사합니다.

```sh
npm run manifest:check
```

검사는 manifest 구조, 패키지 경로, 공개 source export, fixture·테스트·문서 연결을 확인합니다.
CLI는 같은 계약을 도구가 읽을 수 있는 JSON 또는 Markdown으로 출력할 수 있습니다.
