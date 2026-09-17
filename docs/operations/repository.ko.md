# 저장소 설정

[English](repository.md).

GitHub 저장소 설정은 [`.github/repository.json`](../../.github/repository.json)에 선언하고 멱등 명령
하나로 적용합니다. 선언에는 홈페이지, 저장소 기능과 병합 방식, Actions 허용 범위와 워크플로 토큰의
기본 권한, 취약점 알림과 자동 보안 수정, GitHub Pages 빌드 방식, `main`에서만 배포하는
`github-pages` 환경이 들어 있습니다.

```sh
make github-settings
make github-settings-check
```

`make github-settings`는 모든 설정을 `gh api`로 읽고 다른 설정만 바꾼 뒤 다시 읽으며, 그래도 다른
설정이 있으면 실패합니다. 이미 선언과 같은 저장소에서 실행하면 아무것도 바꾸지 않습니다.
`make github-settings-check`는 아무것도 바꾸지 않고, 선언과 다른 설정이 있으면 그 설정과 현재 값,
선언 값을 출력하며 실패합니다. 두 명령 모두 저장소 관리 권한이 있는 인증된 `gh`가 필요합니다.

원격에는 `main`만 둡니다. 같은 이력으로 저장소를 다시 만들면 `main`을 푸시하고
`make github-settings`를 실행해 설정하며, 문서 사이트는 이어지는 `main`의 CI 실행에서
`deploy-docs` 작업이 게시합니다. 설정은 GitHub 화면이 아니라 선언을 고치고 명령을 실행해
바꾸므로 선언이 곧 기록입니다.

`tests/build/github-repository.test.mjs`는 메모리 안의 저장소로 명령을 검사합니다. 선언과 같은
저장소에는 요청을 보내지 않고, 새 저장소는 선언대로 맞춘 뒤 두 번째 실행에서 아무 요청도 보내지
않으며, 선언하지 않은 배포 브랜치는 제거합니다.
