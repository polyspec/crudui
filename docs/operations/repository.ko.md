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
실행에서, `.github/workflows/release.yml`은 push된 tag `v*` 또는 `**/v*`에서([release](#release)) 실행되며, 다른 workflow는 없습니다. 설정은 GitHub 화면이 아니라 선언을 고치고 명령을 실행해 바꾸므로 선언이 곧 기록입니다.

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

## Release

release는 `main` commit의 tag입니다. 저장소는 `vX.Y.Z`이고, 디렉터리의 Go module은 `<디렉터리>/vX.Y.Z`이며 그
module path는 `github.com/polyspec/crudui/<디렉터리>`입니다(`tests/build/package-names.test.mjs`). `main`의 모든
commit은 merge queue로 ruleset의 check를 통과했으므로 release는 test를 다시 실행하지 않습니다. pull request는 tag를
싣지 않고, maintainer가 tag를 만들어 push합니다.

1. pull request `chore(release): Release X.Y.Z (#<작업 ID>)`는 저장소의 모든 `package.json`, `Cargo.toml`,
   `VERSION`, `pyproject.toml`의 version과 저장소 package에 대한 모든 dependency의 version을 X.Y.Z로 정하고,
   `CHANGELOG.md`와 `CHANGELOG.ko.md`의 `## Unreleased`를 `## X.Y.Z`로 바꾼 뒤 그 위에 빈 `## Unreleased`를 새로
   씁니다. Composer manifest는 version을 선언하지 않고 Composer가 tag에서 읽습니다.
2. merge queue가 merge한 뒤 maintainer가 `main`의 그 commit에 tag를 달아 push합니다:

   ```sh
   git tag vX.Y.Z <main의 commit>
   git push origin vX.Y.Z
   ```

3. `.github/workflows/release.yml`은 push된 tag에서(`tags: ['v*', '**/v*']`. tag filter에서 `*`는 `/`와 맞지
   않으므로 `**/v*`가 `packages/<디렉터리>/vX.Y.Z`를 덮습니다) token 권한 `contents: write`로 실행됩니다. 준비
   step(`make install-npm`, `make toolchain-check TOOLS="node npm"`, `make install-node-modules`) 뒤의 마지막 네 step은
   이 순서로 make를 통해 `scripts/release.mjs`를 실행하며, 각각 환경 변수 `TAG`의 tag를 recipe가 `"$$TAG"`로 넘깁니다.
   - `make release-verify`는 tag의 commit이 `origin/main`에 있는지(`git merge-base --is-ancestor`), commit의 check run
     `push-gate`와 `ci-passed`가 conclusion `success`로 끝났는지(`gh api repos/<owner>/<repo>/commits/<sha>/check-runs`)
     확인하고, 빠졌거나 실패한 check마다 적어 실패합니다.
   - `make release-versions`는 tag가 덮는 모든 package 파일의 version이 tag와 같은지, `CHANGELOG.md`에 section
     `## X.Y.Z`가 있는지 확인하고, 파일과 두 version을 적어 실패합니다.
   - `make release-assets`는 `make build`를 실행하고 `packages/`의 archive를 `var/release/assets`에 씁니다. private이
     아닌 npm package마다 `npm pack`, Composer package 디렉터리마다 zip `git archive`를 실행하고, 이름은
     `<package>-<version>.<확장자>`이며 `@scope/`와 `vendor/`는 `scope-`, `vendor-`로 씁니다. release asset은 npm
     tarball과 Composer zip뿐입니다. crate는 archive로 release하지 않고 git tag로 사용합니다. `cargo package`는 git
     의존성을 해석되지 않는 crates.io 요구로 바꾸기 때문입니다. Go module tag는 아무것도 build하거나 첨부하지 않습니다.
   - `make release-publish`는 archive와 함께
     `gh release create <tag> --verify-tag --title <tag> --notes-file <section ## X.Y.Z>`를 실행합니다.

`tests/build/release.test.mjs`는 명령 fake로 script를 검사합니다. tag와 다른 version, 빠진 변경 기록 section, 없거나
진행 중이거나 실패한 check run, `main` 밖의 commit, archive 이름과 명령, 명령을 실행하지 않는 Go module tag, release
명령을 확인하고, 저장소의 모든 package 파일이 version 하나를 갖기를 요구하며 tag가 `packages/`의 package 파일마다
어떻게 release하는지 적습니다.
