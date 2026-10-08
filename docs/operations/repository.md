# Repository settings

[한국어](repository.ko.md).

The GitHub repository settings are declared in
[`.github/repository.json`](../../.github/repository.json) and applied with one idempotent
command. The declaration covers the homepage, the repository features and merge methods, auto-merge
and the deletion of a merged branch, the Actions policy and the default workflow token permissions,
vulnerability alerts and automated security fixes, the GitHub Pages build type, the `github-pages`
environment, which deploys only from `main`, and the ruleset `main` ([publishing main](#publishing-main)).

```sh
make github-settings
make github-settings-check
```

`make github-settings` reads every setting through `gh api`, changes only the ones that differ
and reads them again; it fails when anything still differs. Running it on a repository that
already matches changes nothing. `make github-settings-check` changes nothing and fails when a
setting differs from the declaration, naming the setting, its current value and the declared
value. Both commands need an authenticated `gh` with administration rights on the repository. They
act on the repository on GitHub, so neither `make ci` nor a CI job runs them.

The remote holds `main` and the branches of open pull requests; a merged branch is deleted. A
repository created again from the same history is configured by pushing `main` and running
`make github-settings`; the documentation web is then published by the next run of
`.github/workflows/pages.yml`, which builds and deploys the documentation of every commit that
`main` receives and of a manual run (`workflow_dispatch`). `.github/workflows/ci.yml` runs on every
pull request, merge group and manual run, `.github/workflows/push-gate.yml` on every push to a
branch outside `gh-readonly-queue/**`, every pull request and every merge group, and
`.github/workflows/dependency-review.yml` on its schedule and on a manual run, and
`.github/workflows/release.yml` on a pushed tag `v*` or `**/v*` ([releases](#releases)); no other workflow
exists. Change a setting by editing the declaration and running the command, never through
the GitHub interface, so the declaration stays the record.

`tests/build/github-repository.test.mjs` checks the command against an in-memory repository: a
matching repository receives no request, a new repository is brought to the declaration and a
second run sends nothing, an undeclared deployment branch is removed, the order of rules, checks and
merge methods is not a difference, a ruleset that differs is replaced by its id and another ruleset
is kept, and two rulesets of the name fail. It also requires the checks of the ruleset to be exactly
`push-gate` and `ci-passed`, each the check of one job.

## Publishing main

Every change reaches `main` through a pull request and the merge queue; no command of this
repository pushes `main`. Publish a branch with the standard commands of GitHub, or with the GitHub
UI:

```sh
git push origin HEAD:refs/heads/<branch>
gh pr create --base main --head <branch> --fill
gh pr merge <branch> --auto --rebase
```

The ruleset `main` applies to `refs/heads/main` with enforcement `active` and no bypass actor, so it
binds administrators too. Its rules:

- `pull_request`: a change arrives through a pull request; no approval is required, and the methods
  `merge`, `squash` and `rebase` are allowed, so `gh pr merge --auto` with any of them puts the pull
  request into the queue;
- `merge_queue`: the merge queue merges with the method `REBASE`, so each commit of a pull request
  lands on `main` as a commit of its own, with the grouping strategy `ALLGREEN`, at most 5 entries
  built and merged at once and no wait for more entries; `check_response_timeout_minutes` is 360,
  the maximum of GitHub;
- `required_linear_history`, `non_fast_forward` and `deletion`: no merge commit, no force-push and
  no deletion of `main`;
- `required_status_checks`: the check `push-gate` of `.github/workflows/push-gate.yml` and the check
  `ci-passed` of `.github/workflows/ci.yml`, both of the GitHub Actions app (integration 15368).
  `ci-passed` is the last job of the CI workflow: it needs every other job, runs under
  `if: ${{ always() }}` and runs `make ci-passed RESULTS='${{ toJSON(needs) }}'`, which fails unless
  every needed job has the result `success`, so a failed, cancelled or skipped job fails it, and a
  new or renamed CI job needs no change of the ruleset. `tests/build/ci-local.test.mjs` requires it
  as the last job with every other job in `needs`.

A direct `git push origin <commit>:main` is refused with `GH013: Repository rule violations found`.
The pre-push hook runs on the push of the branch. `gh pr merge --auto` adds the pull request to the
merge queue once its required checks pass on the pull request. The queue rebases it onto `main` as a
merge group on the branch `gh-readonly-queue/main/pr-<number>-<sha>`, both workflows run on that
commit (`merge_group`), and the queue moves `main` to exactly that commit when the checks pass; a
failed check removes the pull request from the queue, and `main` does not move. A run of the CI
workflow for a merge group is never cancelled: each group has a ref of its own, and
`cancel-in-progress` holds only for pull requests. The rebase gives the merged commits new hashes;
`git pull --rebase` drops the local commits that the queue merged.

## Releases

A release is a tag of a commit of `main`: `vX.Y.Z` for the repository, or `<directory>/vX.Y.Z` for the Go module of
that directory, whose module path is `github.com/polyspec/crudui/<directory>` (`tests/build/package-names.test.mjs`).
Every commit of `main` passed the checks of the ruleset through the merge queue, so the release runs no test again. No
pull request carries a tag; the maintainer creates and pushes it.

1. The pull request `chore(release): Release X.Y.Z (#<task ID>)` sets the version of every `package.json`,
   `composer.json` of `packages/`, `Cargo.toml`, `VERSION` and `pyproject.toml` of the repository, and of every
   dependency on a package of the repository, to X.Y.Z, regenerates the locks, and renames `## Unreleased` of
   `CHANGELOG.md` and `CHANGELOG.ko.md` to `## X.Y.Z` below a new empty `## Unreleased`.
2. After the merge queue merged it, the maintainer tags that commit of `main` and pushes the tag:

   ```sh
   git tag vX.Y.Z <commit of main>
   git push origin vX.Y.Z
   ```

3. `.github/workflows/release.yml` runs on the pushed tag (`tags: ['v*', '**/v*']`: in a tag filter `*` does not
   match `/`, so `**/v*` covers `packages/<directory>/vX.Y.Z`), with the token permission `contents: write`. After the
   setup steps (`make install-tools`, `make toolchain-check TOOLS="node npm php composer"`,
   `make install-node-modules`) its last five steps run through make in this order; the steps of `scripts/release.mjs`
   take the tag of the environment variable `TAG`, which the recipe passes as `"$$TAG"`:
   - `make release-verify` requires the commit of the tag on `origin/main` (`git merge-base --is-ancestor`) and the
     check runs `push-gate` and `ci-passed` of the commit completed with conclusion `success`
     (`gh api repos/<owner>/<repo>/commits/<sha>/check-runs`); it fails with each missing or failed check;
   - `make release-versions` requires the version of the tag in every package file that the tag covers and the section
     `## X.Y.Z` of `CHANGELOG.md`; it fails with the file and both versions;
   - `make release-assets` runs `make build` and writes the archives of `packages/` to `var/release/assets`: `npm pack`
     of every npm package that is not private and `git archive` of every Composer package directory as a zip, each
     named `<package>-<version>.<extension>` with `@scope/` and `vendor/` written `scope-` and `vendor-`. An archive
     installs beside the other archives without the repository tree. The published manifests are the package
     manifests of `packages/`, packed unchanged (see "Package manifests and development resolution"). The step fails
     with each packed manifest that differs from its package manifest, that names a dependency of the scope
     `@polyspec` or the vendor `polyspec` by a URL, a path (`file:`, `link:`, `workspace:`), a git source (`git`,
     `github:`, ssh), a range or a development version (`@dev`), or that is a `composer.json` with `repositories` or
     without `version`. The release
     assets are npm tarballs and Composer zips only: a crate is not released as an archive; it is consumed by git tag,
     because `cargo package` rewrites git dependencies into crates.io requirements that do not resolve. A Go module
     tag builds and attaches nothing;
   - `make release-install-check` installs the archives from the consumer fixtures of `tests/release-install` (see
     below);
   - `make release-publish` runs `gh release create <tag> --verify-tag --title <tag> --notes-file <section ## X.Y.Z>`
     with the archives. GitHub accepts a release body of at most 125000 characters; a longer section is replaced by
     the line `The changes of X.Y.Z are listed in [CHANGELOG.md](https://github.com/polyspec/crudui/blob/<tag>/CHANGELOG.md#XYZ).`,
     whose anchor is the version without its dots.

`tests/build/release.test.mjs` checks the script with command fakes: a version that differs from the tag, a missing
change log section, a check run that is missing, in progress or failed, a commit outside `main`, the archive names and
commands, a Go module tag that runs no command, and the release command; it also requires one version in every package
file of the repository and lists how a tag releases each package file of `packages/`.
It checks each refused form of a published dependency, a packed manifest that differs from its package manifest and the
published manifests of the repository, and that the consumer fixtures of `tests/release-install` name the archives of
the version of `package.json`.

`make release-install-check` (`scripts/release-install.mjs check "$TAG"`), the step of the release workflow between
`make release-assets` and `make release-publish`, installs the archives of the tag `TAG` from `var/release/assets` as a
consumer does; a Go module tag `<directory>/vX.Y.Z` releases no archive, so for it the check names the tag and installs
nothing. The install runs in a
temporary directory outside the repository: it copies the fixture `tests/release-install/npm` (`package.json` with the
tarballs as `file:` dependencies, and `package-lock.json`) with the tarballs and runs `npm ci` with an empty cache and
the scope `@polyspec` on the unreachable registry `http://127.0.0.1:9/`, and it copies the fixture
`tests/release-install/composer` (`composer.json` with an `artifact` repository of the zips, and `composer.lock`) with
the zips and runs `composer install` with an empty `COMPOSER_HOME` and `COMPOSER_CACHE_DIR`. The polyspec packages come
only from the archives; a third-party package is downloaded only as its lock pins it, by its exact version and digest.
`make release-install-lock` writes the fixtures of the version of `package.json` and regenerates their locks from the
archives, with each polyspec archive locked by name and version, without `integrity` in npm and with an empty
`shasum` in Composer, and each third-party package by its exact version and digest; the release commit
runs it after `make release-assets TAG=vX.Y.Z RELEASE_COMMIT=HEAD`, which writes the archives before the tag exists.
The CI job `build-lint` runs the same install before any tag: `make release-install-head` writes the archives of `HEAD`
at the version of `package.json` as `make release-assets` writes them and runs `scripts/release-install.mjs check`.

### Package manifests and development resolution

The `package.json` and `composer.json` of each published package of `packages/` is the manifest that its archive
publishes. It names every dependency of the scope `@polyspec` or the vendor `polyspec` by its exact version, and a
`composer.json` declares its `version`, which an `artifact` repository reads, and no `repositories`.

Development resolution is in the two root manifests, which are never published:

- the root `package.json` (`@polyspec/crudui-workspace`, private) lists `packages/*` under `workspaces`; npm links a
  workspace package whose version satisfies the exact version that another package requires, and
  `package-lock.json` records the links. A package of another polyspec repository is supplied only at this root:
  `@polyspec/ordered-json` is the root dependency `file:.form-comparison/sources/ordered-json/js`, the checkout of the
  tag that `orderedJsonVersion` of `examples/form-comparison/src/ordered-json-source.mjs` records;
- the root `composer.json` (`polyspec/crudui-workspace`, type `project`) has a `path` repository of
  `packages/validator-php` with `symlink: false` and requires `polyspec/crudui-validator` at its exact version; its
  `autoload` reads the generator sources of `packages/generator-php/src` and its `autoload-dev` the tests of both PHP
  packages. `composer.lock` beside it records the resolution, and `make install-composer` installs `vendor/` at the
  root, which PHPUnit, the PHP checks and the PHP servers load. The validator in `vendor/` is a copy, which
  `make test-php-api` and the comparison servers reinstall from source under the checkout lock
  `var/locks/composer-vendor.lock` before they load it. The PHPUnit bootstrap `scripts/php-package-autoload.php` loads
  `vendor/` and, ahead of it, the classes of the package of the working directory from its source directory.

`make test-dependencies` validates the root `composer.json` and its lock with `composer validate --strict`, and each
published `composer.json` with `composer validate --no-check-lock`, since a published package has no lock.

### Installing the release archives

A consumer downloads the archives that it needs from the GitHub Release of a tag and installs them together, without a
registry:

- npm: list every tarball in `package.json` as a `file:` dependency, then run `npm install`. A dependency that an
  archive declares at an exact version is satisfied by the tarball of that package installed beside it.

  ```json
  {
    "dependencies": {
      "@polyspec/crudui-generator-html": "file:vendor/polyspec-crudui-generator-html-X.Y.Z.tgz",
      "@polyspec/crudui-generator-core": "file:vendor/polyspec-crudui-generator-core-X.Y.Z.tgz",
      "@polyspec/crudui-validator": "file:vendor/polyspec-crudui-validator-X.Y.Z.tgz"
    }
  }
  ```

- Composer: put the zips in one directory and name it in an `artifact` repository; the zips resolve each other by name
  and version. A `package` repository entry per zip URL works the same way.

  ```json
  {
    "require": { "polyspec/crudui-generator": "X.Y.Z" },
    "repositories": [
      { "type": "artifact", "url": "vendor/polyspec" }
    ]
  }
  ```

  A `package` repository entry for one zip:

  ```json
  {
    "type": "package",
    "package": {
      "name": "polyspec/crudui-validator",
      "version": "X.Y.Z",
      "dist": { "type": "zip", "url": "https://github.com/polyspec/crudui/releases/download/vX.Y.Z/polyspec-crudui-validator-X.Y.Z.zip" },
      "autoload": { "psr-4": { "Polyspec\\Crudui\\Validator\\": "src/", "Polyspec\\Crudui\\": "src/Public/" } }
    }
  }
  ```
