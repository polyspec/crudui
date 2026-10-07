# 저장소 설정

[English](repository.md).

GitHub 저장소 설정은 [`.github/repository.json`](../../.github/repository.json)에 선언하고 멱등 명령
하나로 적용합니다. 선언에는 홈페이지, 저장소 기능과 병합 방식, auto-merge와 merge된 branch의 삭제,
Actions 허용 범위와 워크플로 토큰의 기본 권한, 취약점 알림과 자동 보안 수정, GitHub Pages 빌드 방식,
`main`에서만 배포하는 `github-pages` 환경, ruleset `main`([main 게시](#main-게시))이 들어 있습니다.

```sh
make github-settings
make github-settings-check
```

`make github-settings`는 모든 설정을 `gh api`로 읽고 다른 설정만 바꾼 뒤 다시 읽으며, 그래도 다른
설정이 있으면 실패합니다. 이미 선언과 같은 저장소에서 실행하면 아무것도 바꾸지 않습니다.
`make github-settings-check`는 아무것도 바꾸지 않고, 선언과 다른 설정이 있으면 그 설정과 현재 값,
선언 값을 출력하며 실패합니다. 두 명령 모두 저장소 관리 권한이 있는 인증된 `gh`가 필요합니다. GitHub의
저장소에 작용하므로 `make ci`와 CI job은 이 명령을 실행하지 않습니다.

원격에는 `main`과 열린 pull request의 branch만 있으며, merge된 branch는 지워집니다. 같은 이력으로 저장소를
다시 만들면 `main`을 푸시하고 `make github-settings`를 실행해 설정하며, 문서 웹은 이어지는
`.github/workflows/pages.yml` 실행이 게시합니다. 이 workflow는 `main`이 받는 모든 commit과 수동
실행(`workflow_dispatch`)의 문서를 build해 배포합니다. `.github/workflows/ci.yml`은 모든 pull request,
merge group, 수동 실행에서, `.github/workflows/push-gate.yml`은 `gh-readonly-queue/**` 밖의 branch로의
모든 push, 모든 pull request, 모든 merge group에서, `.github/workflows/dependency-review.yml`은 일정과 수동
실행에서 실행되며, 다른 workflow는 없습니다. 설정은 GitHub 화면이 아니라 선언을 고치고 명령을 실행해 바꾸므로 선언이 곧 기록입니다.

`tests/build/github-repository.test.mjs`는 메모리 안의 저장소로 명령을 검사합니다. 선언과 같은
저장소에는 요청을 보내지 않고, 새 저장소는 선언대로 맞춘 뒤 두 번째 실행에서 아무 요청도 보내지
않으며, 선언하지 않은 배포 브랜치는 제거합니다. rule, check, merge 방식의 순서는 차이가 아니고, 다른
ruleset은 id로 교체하되 다른 이름의 ruleset은 그대로 두며, 같은 이름의 ruleset이 둘이면 실패합니다. 또한
ruleset의 check가 정확히 `push-gate`와 `ci-passed`이고 각각 job 하나의 check여야 합니다.

## main 게시

모든 변경은 pull request와 merge queue를 거쳐서만 `main`에 도달하며, 이 저장소의 어떤 명령도 `main`을
push하지 않습니다. branch는 GitHub의 표준 명령이나 GitHub UI로 게시합니다.

```sh
git push origin HEAD:refs/heads/<branch>
gh pr create --base main --head <branch> --fill
gh pr merge <branch> --auto --rebase
```

ruleset `main`은 enforcement `active`로 `refs/heads/main`에 적용되고 bypass actor가 없으므로 관리자에게도
적용됩니다. rule은 다음과 같습니다.

- `pull_request`: 변경은 pull request로 들어옵니다. 승인은 필요 없고 `merge`, `squash`, `rebase`를 모두
  허용하므로, 어느 방식의 `gh pr merge --auto`도 pull request를 queue에 넣습니다.
- `merge_queue`: merge queue는 `REBASE` 방식으로 merge하므로 pull request의 각 commit이 그대로 `main`의
  commit이 됩니다. grouping 전략은 `ALLGREEN`이고, 한 번에 최대 5개를 build하고 merge하며 더 기다리지
  않습니다. `check_response_timeout_minutes`는 GitHub의 최댓값인 360입니다.
- `required_linear_history`, `non_fast_forward`, `deletion`: `main`에 merge commit, force-push, 삭제를
  허용하지 않습니다.
- `required_status_checks`: `.github/workflows/push-gate.yml`의 check `push-gate`와
  `.github/workflows/ci.yml`의 check `ci-passed`로, 둘 다 GitHub Actions app(integration 15368)의 check입니다.
  `ci-passed`는 CI workflow의 마지막 job으로, 다른 모든 job을 needs로 두고 `if: ${{ always() }}`로 실행되며
  `make ci-passed RESULTS='${{ toJSON(needs) }}'`를 실행합니다. 이 target은 needs의 job 결과가 모두 `success`가
  아니면 실패하므로 실패, 취소, 건너뜀 job이 모두 이 check를 실패시키고, CI job을 추가하거나 이름을 바꿔도
  ruleset은 바뀌지 않습니다. `tests/build/ci-local.test.mjs`는 이 job이 마지막 job이고 `needs`에 다른 모든 job이
  있기를 요구합니다.

`git push origin <commit>:main`으로 직접 push하면 `GH013: Repository rule violations found`로 거부됩니다.
pre-push hook은 branch push에서 실행됩니다. `gh pr merge --auto`는 pull request에서 필수 check가 통과하면 그
pull request를 merge queue에 넣습니다. queue는 그것을 `main` 위로 rebase해 branch
`gh-readonly-queue/main/pr-<number>-<sha>`의 merge group으로 만들고, 두 workflow가 그 commit에서
실행되며(`merge_group`), check가 통과하면 `main`을 정확히 그 commit으로 옮깁니다. check가 실패하면 pull
request는 queue에서 빠지고 `main`은 움직이지 않습니다. merge group의 CI 실행은 취소되지 않습니다. group마다
자기 ref가 있고 `cancel-in-progress`는 pull request에만 적용되기 때문입니다. rebase는 merge된 commit에 새
hash를 주므로, `git pull --rebase`가 queue가 merge한 local commit을 버립니다.
