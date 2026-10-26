# 저장소
<!-- doc-id: docs-operations-repository -->
<!-- source-sha256: 8a08508ce209cc7a90fd70996a0b552b0145521d22db1c56290df2231f9906f2 -->

[English](repository.md).

version이 0.x인 동안 변경이 `main`에 도달하는 방법, 실행되는 workflow, release를 만드는 방법입니다. pull request, merge queue,
GitHub ruleset은 없습니다. 작업은 checklist row마다 commit하며 로컬에서 하고, maintainer가 `main`을 push합니다.

## main 게시

각 개발 작업은 소유 unit test가 통과하면 changelog 항목과 함께 commit하고 row를 `[o]`로 바꿉니다. 거절한 원래 작업은 기록한
원인을 유지합니다. 개발 작업이 완료되거나 수용한 종결 결정이 있고 활성 작업이 없을 때 `main`을 한 번 push합니다.
[Candidate 검토](../plans/release-readiness/plan.ko.md)는 선언한 CI 선행 조건이 충족될 때까지 우회 상태로 둘 수 있으며
publication 전에 재검토합니다.

```sh
git push origin main
```

pre-push hook `.githooks/pre-push`는 row가 `[~]`인 동안 push를 거부하고, `.github/workflows/push-gate.yml`의 job `push-gate`는
그런 row가 있는 push된 commit에서 실패합니다([push 검사](testing.ko.md)). push는 `.github/workflows/ci.yml`을 시작하며, 이
workflow는 전체 suite를 job에서 실행합니다. 마지막 job `ci-passed`는 다른 모든 job이 필요하고 각각이 성공하지 않으면 실패합니다.
tag는 그것이 가리키는 commit에서 `ci-passed`와 `push-gate`가 성공한 뒤에만 만듭니다. agent의 branch와 worktree는
`{type}/{shortname}-{task ID}`와 `{project}-{shortname}-{task ID}`로 이름 짓고 `main`에 merge되는 즉시 지웁니다.

workflow는 다음과 같습니다.

- `.github/workflows/ci.yml`: `main`으로의 push와 수동 실행(`workflow_dispatch`). release가 자기 commit의 check를 요구하므로 나중의
  push가 앞선 commit의 실행을 취소하지 않습니다.
- `.github/workflows/push-gate.yml`: branch로의 모든 push(tag push에서는 실행되지 않음).
- `.github/workflows/pages.yml`: `main`으로의 push와 수동 실행. 문서 web을 build하여 `main`에서만 배포하는 environment `github-pages`에
  배포합니다.
- `.github/workflows/dependency-review.yml`: 예약된 시각과 수동 실행.
- `.github/workflows/release.yml`: push된 tag `v*` 또는 `**/v*`([release](#release)).

다른 workflow는 없습니다(`tests/build/ci-local.test.mts`). GitHub의 저장소 설정(Pages source **GitHub Actions**, environment
`github-pages`)은 GitHub 화면에서 정하며, 이 저장소의 어떤 명령도 이를 적용하지 않습니다.

## Release

release는 `main` commit의 tag입니다. 저장소는 `vX.Y.Z`이고, 디렉터리의 Go module(`packages/generator/go`,
`packages/validator/go`)은 `<디렉터리>/vX.Y.Z`이며 그 module path는 `github.com/polyspec/crudui/<디렉터리>`입니다
(`tests/build/package-names.test.mts`). `main`의 모든 commit은 tag 전에 CI의 전체 suite를 통과했으므로 release는 test를 다시
실행하지 않습니다. tag는 maintainer만 만들어 push합니다. tag가 release하는 package, 덮는 manifest, Go module은
`config/release.json`(`node_modules/@polyspec/kit/dist/schema/release.schema.json`)에 선언합니다.

Native PHP extension은 전체 저장소에서 build합니다. `packages/php-ext/composer.json`은 `config/release.json`의
version-only manifest이므로 version 변경은 `src/config.m4`가 읽는 version을 갱신하며 published asset에 Composer archive나
platform별 binary를 추가하지 않습니다.

1. push된 `main`의 CI가 성공한 뒤, commit `chore(release): Release X.Y.Z (#<작업 ID>)`는 `config/release.json`이 적은 모든
   manifest(`package.json`, `packages/`의 `composer.json`, `Cargo.toml`, `pyproject.toml`)의 version과 저장소 package에 대한 모든
   dependency의 version을 X.Y.Z로 정하고, lock을 다시 만들며, `CHANGELOG.md`와 `CHANGELOG.ko.md`의 `## Unreleased`를
   `## X.Y.Z`로 바꾼 뒤 그 위에 빈 `## Unreleased`를 새로 씁니다.
2. 그 commit에서 `git tag vX.Y.Z`(로컬 tag), `make release-assets TAG=vX.Y.Z`, `make release-consumer-lock TAG=vX.Y.Z`(online)가
   그 version의 archive에 대한 사용자 project `tests/release-install/npm`과 `tests/release-install/composer`의 manifest와 lock을
   씁니다. 로컬 tag는 지우고 그 file을 commit합니다. 그다음 `make release-consumer TAG=vX.Y.Z`가 그것들로 archive를 설치합니다.
3. Push된 commit의 CI가 성공한 뒤 maintainer가 해당 commit에 검증용 로컬 tag를 만듭니다:

   ```sh
   git tag vX.Y.Z <commit of main>
   git tag packages/generator/go/vX.Y.Z <commit of main>
   git tag packages/validator/go/vX.Y.Z <commit of main>
   ```

   이 tag를 push하기 전에 [candidate 재검토 checklist](../plans/release-readiness/checklist.ko.md)의 C18.1을 완료하며
   새 candidate archive와 consumer 검사를 포함합니다. Tag workflow는 proof 뒤 자동 공개하므로 candidate 검토가 우회 또는
   미완료 상태이면 publication tag를 push하지 않습니다. Candidate 입력이 바뀌면 변경 입력을 검증하고 필수 CI 결과를
   확보한 뒤 진행하며 로컬 tag는 검증한 해당 commit을 가리켜야 합니다. Maintainer가 그다음 tag를 push합니다:

   ```sh
   git push origin vX.Y.Z packages/generator/go/vX.Y.Z packages/validator/go/vX.Y.Z
   ```

   tag 셋을 함께 push합니다(`make release-go-tags TAG=vX.Y.Z`가 검사합니다). `vX.Y.Z`의 `make release-verify`가 같은 commit의 Go module
   tag를 요구하고, push는 tag마다 `release.yml` 실행 하나를 시작하기 때문입니다. GitHub는 한 번에 tag를 셋보다 많이 push하면
   실행을 시작하지 않습니다. Go module tag의 실행은 build하거나 설치할 archive가 없고 asset 없는 그 tag의 GitHub Release를 만들며,
   `vX.Y.Z`의 실행에 의존하지 않습니다.
4. `.github/workflows/release.yml`은 push된 tag에서(`tags: ['v*', '**/v*']`. tag filter에서 `*`는 `/`와 맞지
   않으므로 `**/v*`가 `packages/<디렉터리>/vX.Y.Z`를 덮습니다) token 권한 `contents: write`로 실행됩니다. 이 workflow는
   kit의 copy입니다. 준비 step(`make install-tools TOOLS=npm`, `make install-packages`, `config/release.json`이 필요로 하는 도구를
   설치하는 `make release-tools`, `make release-tools-path`) 뒤의 step은 이 순서로 make를 통해 실행되며, `node_modules/@polyspec/kit/dist/release.mjs`의 step은 환경 변수 `TAG`의 tag를 받습니다.
   - `make release-verify`는 tag의 commit이 `origin/main`에 있는지(`git merge-base --is-ancestor`), 모든 Go module의 tag
     `<directory>/vX.Y.Z`가 같은 commit에 있는지, commit의 check run `push-gate`와 `ci-passed`가 conclusion `success`로
     끝났는지(`gh api repos/<owner>/<repo>/commits/<sha>/check-runs`) 확인하고, 빠졌거나 실패한 check마다 적어 실패합니다.
   - `make release-versions`는 `config/release.json`이 적은 모든 manifest의 version이 tag와 같은지, 모든 Go module의 module
     path, `CHANGELOG.md`와 `CHANGELOG.ko.md`의 section `## X.Y.Z`가 있는지 확인하고, 파일과 두 version을 적어 실패합니다.
   - `make release-assets`는 `make build`를 실행하고 `config/release.json`의 package archive를 `var/release/assets`에 씁니다.
     release하는 npm package마다 `npm pack`, Composer package 디렉터리마다 zip `git archive`를 실행하고, 이름은
     `<package>-<language>-<version>.<확장자>`이며 `@scope/`와 `vendor/`는 `scope-`, `vendor-`로 쓰고 language는 `npm` 또는
     `php`입니다(`@polyspec/crudui-validator`는 `polyspec-crudui-validator-npm-X.Y.Z.tgz`, `polyspec/crudui-validator`는
     `polyspec-crudui-validator-php-X.Y.Z.zip`). archive는 저장소 tree 없이 다른 archive 옆에 설치됩니다. 게시되는 manifest는
     `packages/`의 package manifest이며 바꾸지 않고 pack합니다("Package manifest와 개발 해석" 참고). 이 step은 package
     manifest와 다른 pack된 manifest, scope `@polyspec`나 vendor `polyspec`의 의존성을 정확한 version이 아닌 것으로 적은 pack된
     manifest를 하나씩 적어 실패합니다. `config/release.json`의 각 Python package는 `config/toolchain.json`의 `pythonBackend`로
     build하는 wheel입니다(kit K29, K166, C14.44). generator는 같은 release의 validator인 `polyspec-crudui-validator==X.Y.Z`를
     요구하며, 그 wheel은 옆의 asset입니다. crate는 archive로 release하지 않고 git tag로 사용합니다. Go module tag는 아무것도 build하거나 첨부하지 않습니다.
   - `make release-publish`는 archive와 section `## X.Y.Z`를 notes로 하여 tag의 release를 draft로 만들며, 앞선 실행의 draft는
     대체합니다. GitHub는 125000자까지의 release 본문을 받으므로, 더 긴 section은 tag 시점의 `CHANGELOG.md` section을 link하는 한
     줄로 대신합니다.
   - `make release-proof TAG=<tag>`는 checkout 밖에서 draft를 증명합니다. asset, `config/release.json`의 consumer 설치(아래 참고),
     git-tag 설치, Go module을 확인합니다.
   - `make release-undraft TAG=<tag>`는 증명이 통과한 뒤에만 draft를 공개합니다. 실패한 step은 release를 draft로 남기고 실행을
     실패시킵니다.

polyspec/kit의 test(`tests/kit/release.test.mts`와 `tests/kit/release-go-tags.test.mts`)는 명령 fake로 도구를 검사합니다.
`make release-coverage`는 저장소의 모든 `package.json`, `composer.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`가
`config/release.json`에 분류되어 있을 것을 요구합니다.

개발자가 `make release-assets` 뒤에 실행하고 release 증명이 draft에서 실행하는 `make release-consumer TAG=vX.Y.Z`
(`node_modules/@polyspec/kit/dist/release-consumer.mjs`)는 tag의 archive를 `var/release/assets`에서 사용자처럼, 빈 npm과 Composer cache를 둔 저장소 밖의
새 임시 디렉터리에 설치합니다. commit된 project는 `tests/release-install/npm`(tarball을 `file:` 의존성으로 적은 `package.json`과
`package-lock.json`)과 `tests/release-install/composer`(zip의 `artifact` repository를 둔 `composer.json`과 `composer.lock`)이며,
scope `@polyspec`은 닿지 않는 registry `http://127.0.0.1:9/`를 가리킵니다. polyspec package는 archive에서만 오고, 제3자 package는
lock이 정확한 version과 digest로 고정한 대로만 내려받습니다. 설치된 모든 package는 tag의 version이어야 하고,
`config/release.json`의 `consumers`가 적은 smoke 명령이 설치된 project에서 실행됩니다. Go module tag는 archive를 release하지 않으므로
그것에는 아무것도 설치하지 않습니다. `make release-consumer-lock`은 archive에서 그 version의 manifest와 lock을 쓰며,
polyspec archive는 이름과 version으로만(npm은 `integrity` 없이, Composer는 빈 `shasum`으로) lock합니다.
그 version의 첫 release 전에는 file이 이전 version의 archive를 적고 있으며, 2번 step이 이를 씁니다.

### Package manifest와 개발 해석

`packages/`의 게시되는 package마다 `package.json`과 `composer.json`이 그 archive가 게시하는 manifest입니다. scope
`@polyspec`나 vendor `polyspec`의 의존성은 모두 정확한 version으로 적고, `composer.json`은 `artifact` repository가 읽는
`version`을 선언하며 `repositories`는 없습니다.

개발 해석은 게시되지 않는 두 root manifest에 있습니다.

- root `package.json`(`@polyspec/crudui-workspace`, private)은 `workspaces`에 `packages/*`를 적습니다. npm은 다른
  package가 요구하는 정확한 version을 만족하는 workspace package를 link하고, `package-lock.json`이 link를 기록합니다.
  다른 polyspec 저장소의 package는 이 root에서만 공급합니다. `@polyspec/ordered-json`은 tag `v0.0.9`의 release asset
  `polyspec-ordered-json-npm-0.0.9.tgz`를 root devDependency로 두며, `@polyspec/kit`처럼 URL과 integrity로 고정하고,
  `kit link`가 sibling checkout에 연결합니다.
- root `composer.json`(`polyspec/crudui-workspace`, type `project`)은 Composer 기본 link를 쓰는
  `packages/validator/php`와 `packages/generator/php`의 `path` repository를 두고 `polyspec/crudui-validator`와
  `polyspec/crudui-generator`를 정확한 version으로 요구합니다. 따라서 `vendor/`는 각 package를 source 디렉터리에
  link하고 그 package 자신의 `composer.json`의 `autoload`로 load합니다. `autoload-dev`는 두 PHP package의 test와
  `tests/`의 test class를 읽습니다. 옆의 `composer.lock`이 해석을 기록하고, `make crudui-install-composer`가 root에
  `vendor/`를 설치하며, PHPUnit(각 package의 bootstrap은 `vendor/autoload.php`), PHP check, PHP server가 그것을
  load합니다.

`make crudui-test-dependencies`는 root `composer.json`과 lock을 `composer validate --strict`로, 게시되는 `composer.json`은 lock이
없으므로 `composer validate --no-check-lock`으로 검사합니다.

### 로컬 source 설치

npm source 폴더는 native `npm link --no-save --package-lock=false`로 연결한다. Release manifest와 lock은 유지하며 설치
링크를 통해 source 변경이 즉시 보인다. 컴파일 package는 source 변경 뒤 native build가 필요하다.

Composer 개발은 `composer.local.json`과 native `composer.local.lock`을 명시적으로 선택한다. Path repository는 이 checkout의
두 PHP package와 `../ordered-json/packages/php`를 `vendor/`에 연결한다. OrderedJSON 요구는 0.0.x source version을 허용하며
Composer가 실제 선택 version, 요구와 autoload를 기록한다. Version alias나 설치 기록 재작성은 사용하지 않는다.

```sh
COMPOSER=composer.local.json make crudui-install-composer
make crudui-local-composer-check
```

로컬 설치는 native Composer source resolution에 위임하고 선택 provider와 의존 package를 갱신한다. Resolution이 바뀌면
local lock도 바뀐다. 서로 다른 project에 `COMPOSER`를 전역 export하지 않는다. CI와 archive 설치는 selector를 지정하지 않고
선언한 release artifact를 포함한 `composer.json`과 `composer.lock`을 사용한다. 개발 호환성은 선택한 native Composer profile로
검사하며 release dependency policy는 선언한 release lock을 검토한다. Candidate archive 검증은 C18.1로 남는다.

### release archive 설치

사용자는 tag의 GitHub Release에서 필요한 archive를 내려받아 registry 없이 함께 설치합니다.

- npm: 모든 tarball을 `package.json`에 `file:` 의존성으로 적고 `npm install`을 실행합니다. archive가 정확한
  version으로 선언한 의존성은 옆에 설치된 그 package의 tarball이 충족합니다.

  ```json
  {
    "dependencies": {
      "@polyspec/crudui-generator-html": "file:vendor/polyspec-crudui-generator-html-npm-X.Y.Z.tgz",
      "@polyspec/crudui-generator-core": "file:vendor/polyspec-crudui-generator-core-npm-X.Y.Z.tgz",
      "@polyspec/crudui-validator": "file:vendor/polyspec-crudui-validator-npm-X.Y.Z.tgz"
    }
  }
  ```

- Composer: zip을 한 디렉터리에 두고 그 디렉터리를 `artifact` repository로 적습니다. zip들은 이름과 version으로 서로를
  해석합니다. zip URL마다 `package` repository 항목 하나를 두어도 같습니다.

  ```json
  {
    "require": { "polyspec/crudui-generator": "X.Y.Z" },
    "repositories": [
      { "type": "artifact", "url": "vendor/polyspec" }
    ]
  }
  ```

  zip 하나의 `package` repository 항목:

  ```json
  {
    "type": "package",
    "package": {
      "name": "polyspec/crudui-validator",
      "version": "X.Y.Z",
      "dist": { "type": "zip", "url": "https://github.com/polyspec/crudui/releases/download/vX.Y.Z/polyspec-crudui-validator-php-X.Y.Z.zip" },
      "autoload": { "psr-4": { "Polyspec\\Crudui\\Validator\\": "src/", "Polyspec\\Crudui\\": "src/Public/" } }
    }
  }
  ```
