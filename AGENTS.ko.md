# 개발

- 동작이나 방향을 변경하기 전에 명세를 갱신합니다.
- 브랜치는 `{type}/{shortname}-{체크리스트 ID}`, 워크트리는 `{프로젝트}-{shortname}-{체크리스트 ID}`로
  이름 짓습니다. 브랜치를 `main`에 통합한 뒤 커밋이나 동등한 변경이 반영됐고 워크트리가 깨끗한지 확인합니다.
  삭제할 워크트리에만 있는 `.gitignore` 제외 파일 중 계속 필요한 파일은 먼저 다른 곳에 보존합니다.
  그런 다음 워크트리와 로컬 브랜치를 즉시 제거합니다.
  미통합 작업이나 진행 중인 작업은 보존합니다.
- `main`에 통합할 수 없는 테스트 전용 브랜치의 의미 있는 커밋은 관련 기능을 커밋하기 전에 체리픽하고,
  나머지 테스트 전용 변경은 폐기한 뒤 워크트리와 브랜치를 제거합니다. 제거할 수 없다면 먼저 소유
  체크리스트에 번호가 붙은 하위 항목을 추가하고 원인과 정확한 제거 조건을 기록합니다.
- 대응하는 `.ko.md` 파일을 같은 정보로 갱신합니다.
- 완료된 기능은 그 기능을 완료하는 커밋에 `CHANGELOG.md`와 `CHANGELOG.ko.md`의 `## Unreleased`
  section 맨 위 항목 `### <날짜> — <제목> (<작업 ID>)`으로 함께 남기고, 커밋되지
  않은 변경은 기능 하나로 제한합니다. 지시를 받으면 진행 중 기능의 완료에 필요한지,
  독립 기능인지, 뒤에 할 일인지 먼저 판단하고 사용자가 즉시 처리를 명시하지 않았다면
  진행 중 기능부터 완료합니다.
- 커밋 로그는 영문으로 `type(scope): subject (#issue)` 형식으로 쓴다: 50자 이내 명령조 대문자 시작
  제목(끝 마침표 없음), 빈 줄, 72자 부근 개행한 본문(무엇을·왜 변경했는지), 선택적 꼬리말. 타입은
  feat, fix, docs, style, refactor, test, chore 중 하나다.
- 개발하는 동안에는 바뀐 것을 소유한 unit test, 곧 그 Red와 Green case만 실행합니다. end-to-end 검사(browser,
  container, form comparison, native와 cross-check suite, 전체 build), `make owner-check`, 전체 실행 `make ci`는 pull request의
  CI에서 실행하며, push나 commit 전에 local 검사를 요구하는 규칙은 없습니다. CI가 보고한 실패는 다른 결함처럼
  작업을 얻습니다. 모든 테스트는 자신의 실행·완료·성공·실패와 경과 시간을 출력합니다. 각 test case는
  짧은 검증 단위이며 자기 timeout을 가지고, 전체 일괄 timeout은 쓰지 않습니다. 장기 작업(build,
  install, toolchain setup, browser close, server stop, 전체 suite)은 상세 step log를 출력하고
  timeout을 두지 않으며, 출력 없음 한도도 두지 않습니다. 그 성공과 실패는 관측한 결과와 오류로
  판정하고, 그 끝은 그 결과의 event입니다. 수십 분 동안 실행되는 테스트와 시작과 끝만 출력하는
  테스트는 결함입니다.
- `make ci`는 요청할 때 이 machine에서 CI workflow를 재현합니다. 그 guard `scripts/full-run.mjs`는 커밋된 tree마다
  한 번 실행합니다. 작업이 `[~]`이거나, 추적 파일의 변경이 커밋되지 않았거나,
  `var/full-run.json`이 현재 tree의 전체 실행을 기록하고 있거나, pre-push hook이 설치되지 않았으면 `make ci`는 거부됩니다.
  `make rerun-failed`는 현재 tree에서 통과하지 못한 명령만 다시 실행합니다(`docs/operations/testing.md`).
- push는 push되는 commit에도 working tree에도 checklist의 `[~]` 작업이 없을 때만 합니다. 이것이 push 전의 유일한 검사이며
  test는 실행하지 않습니다. 추적되는 pre-push hook
  `.githooks/pre-push`는 `node scripts/push-gate.mjs hook`을 실행하고, 이 entry는 그런 push를 거부하며 진행 중인 각 작업을
  적습니다. 모든 `make` 실행은 Makefile을 읽을 때 `core.hooksPath`를 `.githooks`로 설정합니다. `make hooks`는 hook을
  설치하고 검사하며, `make hooks-check`는 hook이 설치되지 않은 동안 실패합니다. `.github/workflows/push-gate.yml`의 job
  `push-gate`는 push되는 모든 commit과 pull request에 `node scripts/push-gate.mjs commit <sha>`를 실행하고, hook을 거치지
  않은 push에 같은 message로 실패합니다. 이어서 Node.js만으로 문서와 checklist 규칙을 검사하는 `make records-check`를
  실행하므로, 그 규칙을 어긴 commit도 실패합니다.
- owner와 모든 agent의 변경은 pull request와 merge queue를 거쳐서만 `main`에 도달하며, 이 저장소의 어떤 명령도 `main`을
  push하지 않습니다. branch는 GitHub의 표준 명령이나 GitHub UI로 게시합니다.

  ```sh
  git push origin HEAD:refs/heads/<branch>
  gh pr create --base main --head <branch> --fill
  gh pr merge <branch> --auto --rebase
  ```

  `.github/repository.json`의 ruleset `main`은 승인 없는 pull request, merge 방식 `REBASE`의 merge queue, 선형 이력,
  check `push-gate`, 그리고 `.github/workflows/ci.yml`의 다른 모든 job을 needs로 두고 그 job이 모두 성공해야만 성공하는 마지막 job
  `ci-passed`의 check를 요구하고, `main`의 force-push와 삭제를 거부하며
  bypass actor가 없으므로, GitHub는 `main`으로의 직접 push를 관리자에게도 거부합니다. rebase는 merge된 commit에 새
  hash를 주므로, `git pull --rebase`가 queue가 merge한 local commit을 버립니다. `make github-settings`는 선언을
  적용하고, `make github-settings-check`는 저장소가 선언과 다르면 실패합니다(`docs/operations/repository.md`).
- 계약은 `docs/spec/`, 구현·배포 상태는 `docs/features.md`, 절차는
  `docs/operations/`, 계획된 작업과 그 검증·완료는 `docs/plans/execution-checklist.md`,
  실제 변경은 `CHANGELOG.md`에서 관리합니다. 모든 변경은 checklist의 작업 하나에 속하며,
  작업이 없으면 작업을 먼저 추가합니다.
- 현재 계약을 충족하는 가장 단순한 구현을 사용합니다. 교체한 런타임 경로를
  제거하고 호환·마이그레이션 코드를 추가하지 않습니다.
- 구조 컴파일·인스턴스 데이터·렌더링·검증을 분리합니다.
- 저장소 경로는 저장소 상대경로로 기록합니다. 런타임 코드는 선언한 저장소 루트나
  모듈 위치에서 저장소 입력을 해석합니다. 외부 입력에는 명시적인 경로나 기준이 되는
  발견 기록 하나를 요구합니다. 심볼릭 링크, 누락된 기록, 모호한 발견 결과를
  거부합니다.
- 준비 완료와 성공은 해당 구성 요소의 이벤트, Promise 또는 프로세스 종료로
  판정합니다. 구성 요소가 완료를 게시할 수 있으면 sleep 간격이나 주기적 상태
  조회를 사용하지 않습니다. 시간 제한은 완료되지 않은 작업을 실패로 종료하는
  용도로만 사용하며 경과 시간으로 성공을 판정하지 않습니다.
- 현재 계약이 생략 가능한 입력의 값을 정의한 경우에만 기본값을 사용합니다. 잘못된
  입력, 누락된 의존성, 실패한 작업을 다른 경로, 구현 또는 결과로 대체하지 않습니다.
- 되돌리기 전에 변경을 확인합니다. 해롭거나 잘못되거나 불필요한 변경을
  제거합니다. 유지한 변경은 실제 목적을 설명합니다.
- 관측된 결함은 추적되는 실패 테스트로 재현합니다. 아직 관측되지 않았지만
  발생 가능한 결함은 그 문제를 드러낼 입력과 요구 결과를 가진 결정적인
  실패 사례를 먼저 작성합니다. 구현 전에 의도한 실패를 확인하고 원인을
  고친 뒤 같은 사례와 관련 사용 테스트의 통과를 확인합니다. 사례가
  문제를 드러내지 못하면 기준을 낮추지 말고 조사합니다.
- `scripts/owner-checks.json`은 각 경로를 소유한 검사와 각 검사가 읽는 경로를 선언합니다. `make owner-check`는
  요청할 때 바뀐 경로의 owner를 실행하고 full suite는 실행하지 않으며,
  어떤 규칙도 소유하지 않는 경로와, 검사가 읽는 경로(`inputs`)를 그 경로의 규칙이 그 검사로 고르지 않을 때
  실패합니다. 새 경로는 같은 변경에서 그 file에 owner를 얻습니다. 현재 코드의 검사 결과와 배포 상태를
  별도로 기록합니다.
- 주석·문서·변경 기록·사용자 출력은 현재 동작을 직접 서술합니다. 주체·동작·
  대상·결과를 명시하고 필요한 원인은 한 문장으로 설명합니다.
- 비유·의인화·구어체를 사용하지 않습니다. 외부 출처·복제·이식 이력을
  기록하지 않습니다. 현재 계약이나 절차에 외부 프로젝트의 식별자·API·경로가
  필요한 경우에만 해당 프로젝트를 명시합니다.
- 개인 선호와 대화 맥락은 저장소 외부에 보관합니다.

# Release

- release는 merge queue로 ruleset의 check를 통과한 `main` commit의 tag입니다. 저장소는 `vX.Y.Z`, 디렉터리의 Go
  module은 `<디렉터리>/vX.Y.Z`입니다. pull request는 tag를 싣지 않고, tag는 maintainer만 만들고 옮기고 push합니다.
- version을 올리는 pull request `chore(release): Release X.Y.Z (#<작업 ID>)`가 먼저 옵니다. 이 pull request는
  저장소의 모든 `package.json`, `Cargo.toml`, `VERSION`, `pyproject.toml`의 version과 저장소 package에 대한 모든
  dependency의 version을 X.Y.Z로 정하고, `CHANGELOG.md`와 `CHANGELOG.ko.md`의 `## Unreleased`를 `## X.Y.Z`로 바꾼 뒤
  그 위에 빈 `## Unreleased`를 새로 씁니다. Composer manifest는 version을 선언하지 않고 Composer가 tag에서 읽습니다.
- 그다음 maintainer가 merge된 commit에 tag를 달아 push합니다. `.github/workflows/release.yml`은
  `make release-check`, `make release-assets`, `make release-publish`(`scripts/release.mjs`)를 실행해, commit이 `main`에
  있고 check `push-gate`와 `ci-passed`가 success로 끝났는지, 모든 package 파일의 version이 tag와 같은지, section
  `## X.Y.Z`가 있는지 확인하고, 그 section을 notes로, `packages/`의 npm, Composer, Cargo archive를 첨부해 GitHub
  Release를 만듭니다(`docs/operations/repository.md`).

# Checklist

- 이 저장소의 checklist는 `docs/plans/execution-checklist.md` 하나다. 작업을 하위 항목으로 나누거나
  작업을 추가하고, 다른 checklist를 만들지 않는다. 저장소마다 자기 checklist를 따로 운영한다.
- 작업 상태는 네 가지다. `[ ]` 대기, `[~]` 진행 중, `[o]` 완료, `[!]` 일시 우회. 커밋된 tree에서
  verification이 통과한 뒤에만 `[o]`로 바꾼다.
- 작업 상태 표시는, Markdown task list가 쓰는 대괄호 안의 x나 대문자 X도, checklist에서 작업 행 마지막 칸 첫머리의 상태로만 쓴다. checklist에는 범례가 없고
  문장은 상태를 말로 적는다. `scripts/check-documents.mjs`는 다른 표시에 대해 실패하고 그 file, 줄, 열을 적는다.
- checklist에는 제목과 작업 table만 두며, `scripts/check-documents.mjs`는 다른 줄에 대해 file, 줄, 열을 적고
  실패한다. 각 wave는 wave 이름이 `docs/plans/waves.ko.md`의 section `wave-<n>`을 link하는 `## Wave <n> — <제목>`
  제목과 그 뒤의 ID, 작업, Verification, 상태 열을 가진 table이다. Task ID 형식은 `C<wave>.<number>`이며 작업
  행은 ID로 시작한다. `docs/plans/waves.md`가 wave마다 의존과 배경을 적고, wave는 의존으로 적은 wave가 끝나면
  시작한다.
- 작업은 specification을 먼저 바꾸고, failing test를 더하고, 그다음 implementation을 바꾼다.
- `[!]`는 이 작업을 우회하지 않으면 다음 작업을 진행할 수 없을 때만 쓴다. 작업에 원인과 재시도
  조건을 기록하고, 그 조건이 성립하면 승인을 기다리지 않고 재개한다. `[!]`는 완료가 아니다. 감사는
  `[!]` 작업과 그 원인·재시도 조건만 다루고, 관련 없는 full test를 반복하지 않는다.
- 새 문제는 새 작업으로 올린다. `[o]` 작업과 관련된 문제는 그 작업의 ID를 이어 붙인 하위 항목
  (`C1.2-1`, `C1.2-2`)으로 올려 `[~]`와 `[o]`를 거치게 하고, `[o]` 작업의 상태는 그대로 둔다.
- 작업은 문제나, 명시한 가정 문제를 failing test로 먼저 재현하고, 그 실패를 확인하고, implementation을
  바꾼 뒤 같은 test의 통과를 확인한다.
- 작업의 Verification 열에는 그 작업을 소유한 명령을 적고, `make ci`나 full suite를 적지 않는다.
- 독립 작업은 병렬로 진행해도 되지만, 새 작업을 시작하는 것보다 진행 중인 작업을 끝내는 것이 먼저다.
  `[~]`가 아니라 `[o]`가 계속 늘어나야 한다.
- 커밋하지 않은 변경은 작업 하나를 넘지 않는다. 작업이 `[o]`가 되면 같은 작업 단위에서 changelog
  항목과 커밋을 남긴다.
- 지시를 받으면 먼저 checklist의 작업인지, 이 파일의 규칙인지, 답변만 할 일인지 분류한다. 지시가
  급하다고 명시하지 않는 한, 우선순위와 함께 작업으로 기록하고 진행 중인 작업을 계속한다. 규칙은
  이 파일에 중복 없이 두고, checklist나 changelog에는 넣지 않는다.
- 한글 문서는 기술 용어를 영어 그대로 쓰고 문맥만 한글로 쓴다.

# 멱등성

같은 tree는 모든 날짜와 machine에서 같은 결과를 내고, 실패한 실행은 무엇이 왜 실패했는지 보여 준다.

- 도구와 의존성: 모든 도구는 checkout이 기록한 정확한 release(`.node-version`, `.go-version`, `rust-toolchain.toml`,
  `config/toolchain.json`, `package.json`의 `packageManager`)로 실행되고, `node scripts/check-toolchain.mjs`는 다른 release에
  대해 실패한다. image는 digest로, 그 Debian package는 snapshot 날짜로, action은 commit SHA로, browser는 잠긴 package가
  고정한 build로 지정한다. 어떤 실행도 registry에 최신 release나 channel을 묻지 않고, 어떤 도구도 스스로 다른 release를
  설치하지 않는다(`RUSTUP_AUTO_INSTALL=0`, `GOTOOLCHAIN=local`). repository의 도구는 checkout(`.tools`)에 설치하며, 다른
  checkout이 함께 쓰는 machine에는 설치하지 않는다.
- 입력: 검사는 자신이나 선언된 준비가 같은 실행에서 만든 출력(`require-current-build`를 거친 build, 다시 설치한 복사본,
  자기 기록)만 읽고, 다른 명령이나 실행이 남긴 것은 읽지 않는다.
- 게시: 다른 실행이 읽을 수 있는 공유 출력은 그 실행의 경로에 쓴 뒤 제자리로 rename한다.
- 실패: 독립된 모든 검사는 앞의 검사가 실패한 뒤에도 실행되고(`|| status=1`과 `exit $status`), 실행은 마지막 검사 뒤에
  모든 실패와 함께 실패한다. `&&`는 뒤 단계가 앞 단계의 출력을 읽는 단계만 잇는다.
- 메시지: 모든 실패는 기대한 값, 실제 값, 도구의 오류를 관련된 명령, 경로, 한도와 함께 밝힌다. timeout은 명령, 그 한도,
  경과 시간을 밝힌다.
- 빈 선택: 아무것도 검사하지 않는 실행, 선택, 검사 목록은 실패한다(`ran no test case`, `ran no command`, 검사의 빈 목록).
- process: 실행은 process를 자기 group에서 시작하고, tree 전체를 멈춘 뒤 사라질 때까지 기다리며, 잡은 것은 `finally`에서
  놓는다.
- 단언: test는 외부 도구의 구조화된 결과(exit status, report, event)를 단언하고, version, locale, 부모 process에 따라 문구가
  바뀌는 사람이 읽는 출력은 단언하지 않는다. Makefile 대상의 명령은 `tests/build/make-dry-run.mjs`의 `makeDryRun`으로만
  읽는다.
- owner: 모든 경로는 `scripts/owner-checks.json`에 owner와 각 검사가 읽는 경로를 가지며, CI는 push마다 모든 검사를
  실행한다.
- 공유 자원: 실행들이 함께 쓰는 자원은 lease(`scripts/holder-lock.mjs`)로 잡거나 실행마다 자기 directory, 이름, port를
  쓴다. port는 그것에서 수신하는 server가 잡고(port 0) 알리며, 미리 확인하지 않는다.
