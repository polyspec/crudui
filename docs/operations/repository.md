# Repository
<!-- doc-id: docs-operations-repository -->

[한국어](repository.ko.md).

How a change reaches `main`, which workflows run and how a release is made while the version is 0.x. There is no pull
request, merge queue or GitHub ruleset: work is committed locally, one checklist row per commit, and the maintainer
pushes `main`.

## Publishing main

Each task of `docs/plans/execution-checklist.md` is committed with its changelog entry when its unit tests pass, and the
row becomes `[o]`. `main` is pushed once, when every row is `[o]`:

```sh
git push origin main
```

The pre-push hook `.githooks/pre-push` refuses the push while a row is `[~]`, and the job `push-gate` of
`.github/workflows/push-gate.yml` fails for a pushed commit that has such a row
([push check](testing.md)). The push starts `.github/workflows/ci.yml`, which runs the full suite in its jobs; its last
job `ci-passed` needs every other job and fails unless each of them succeeded. A tag is created only after `ci-passed` and
`push-gate` succeeded for the commit that it names. A branch or worktree of an agent is named
`{type}/{shortname}-{task ID}` and `{project}-{shortname}-{task ID}` and is removed as soon as it is merged into `main`.

The workflows are:

- `.github/workflows/ci.yml` on a push to `main` and on a manual run (`workflow_dispatch`); a later push never cancels the
  run of an earlier commit, because a release requires the checks of its own commit;
- `.github/workflows/push-gate.yml` on every push to a branch, never on a tag;
- `.github/workflows/pages.yml` on a push to `main` and on a manual run: it builds the documentation web and deploys it to
  the environment `github-pages`, which deploys only from `main`;
- `.github/workflows/dependency-review.yml` on its schedule and on a manual run;
- `.github/workflows/release.yml` on a pushed tag `v*` or `**/v*` ([releases](#releases)).

No other workflow exists (`tests/build/ci-local.test.mts`). The settings of the repository on GitHub (the Pages source
**GitHub Actions**, the environment `github-pages`) are set in the GitHub interface; no command of this repository
applies them.

## Releases

A release is a tag of a commit of `main`: `vX.Y.Z` for the repository, or `<directory>/vX.Y.Z` for the Go module of
that directory (`packages/generator/go` and `packages/validator/go`), whose module path is
`github.com/polyspec/crudui/<directory>` (`tests/build/package-names.test.mts`). Every commit of `main` passed the full
suite of CI before the tag, so the release runs no test again. Only the maintainer creates and pushes a tag. The
packages, the manifests that a tag covers and the Go modules are declared in `config/release.json`
(`node_modules/@polyspec/kit/dist/schema/release.schema.json`).

1. After CI succeeded for the pushed `main`, the commit `chore(release): Release X.Y.Z (#<task ID>)` sets the version of
   every manifest that `config/release.json` lists (`package.json`, the `composer.json` of `packages/`, `Cargo.toml`,
   `pyproject.toml`), and of every dependency and git pin on a package of the repository, to X.Y.Z, regenerates the locks,
   and renames `## Unreleased` of `CHANGELOG.md` and `CHANGELOG.ko.md` to `## X.Y.Z` below a new empty `## Unreleased`.
2. On that commit, `git tag vX.Y.Z` (a local tag), `make release-assets TAG=vX.Y.Z` and
   `make release-consumer-lock TAG=vX.Y.Z` (online) write the manifests and locks of the consumer projects
   `tests/release-install/npm` and `tests/release-install/composer` for the archives of the version; the local tag is
   deleted, and the files are committed. `make release-consumer TAG=vX.Y.Z` then installs the archives from them.
3. After CI succeeded for the pushed commit, the maintainer tags it and pushes the tag:

   ```sh
   git tag vX.Y.Z <commit of main>
   git tag packages/generator/go/vX.Y.Z <commit of main>
   git tag packages/validator/go/vX.Y.Z <commit of main>
   git push origin vX.Y.Z packages/generator/go/vX.Y.Z packages/validator/go/vX.Y.Z
   ```

   The three tags are pushed together (`make release-go-tags TAG=vX.Y.Z` checks them): `make release-verify` of `vX.Y.Z`
   requires the Go module tags at the same commit, and the push starts one run of `release.yml` for each tag. GitHub starts
   no run when more than three tags are pushed at once. The run of a Go module tag has no archive to build or install and
   creates a GitHub Release of that tag without assets; it does not depend on the run of `vX.Y.Z`.
4. `.github/workflows/release.yml` runs on the pushed tag (`tags: ['v*', '**/v*']`: in a tag filter `*` does not
   match `/`, so `**/v*` covers `packages/<directory>/vX.Y.Z`), with the token permission `contents: write`. The workflow
   is the copy of kit. After the setup steps (`make install-tools TOOLS=npm`, `make install-packages`, `make release-tools`,
   which installs the tools that `config/release.json` needs, and `make release-tools-path`) its steps run through make
   in this order; the steps of `node_modules/@polyspec/kit/dist/release.mjs` take the tag of the environment variable `TAG`:
   - `make release-verify` requires the commit of the tag on `origin/main` (`git merge-base --is-ancestor`), the tag
     `<directory>/vX.Y.Z` of every Go module at the same commit, and the check runs `push-gate` and `ci-passed` of the
     commit completed with conclusion `success` (`gh api repos/<owner>/<repo>/commits/<sha>/check-runs`); it fails with
     each missing or failed check;
   - `make release-versions` first runs `make release-pins`, which requires every git pin of this repository in a `pyproject.toml`
     to name the version of the tag; it requires the version of the tag in every manifest that `config/release.json` lists, the
     module path of every Go module, and the section `## X.Y.Z` of `CHANGELOG.md` and `CHANGELOG.ko.md`; it fails with the
     file and both versions;
   - `make release-assets` runs `make build` and writes the archives of the packages of `config/release.json` to
     `var/release/assets`: `npm pack` of every npm package that is released and `git archive` of every Composer package
     directory as a zip, each named `<package>-<language>-<version>.<extension>` with `@scope/` and `vendor/` written
     `scope-` and `vendor-` and the language `npm` or `php` (`@polyspec/crudui-validator` is
     `polyspec-crudui-validator-npm-X.Y.Z.tgz`, `polyspec/crudui-validator` is `polyspec-crudui-validator-php-X.Y.Z.zip`).
     An archive installs beside the other archives without the repository tree. The published manifests are the package
     manifests of `packages/`, packed unchanged (see "Package manifests and development resolution"). The step fails
     with each packed manifest that differs from its package manifest or that names a dependency of the scope
     `@polyspec` or the vendor `polyspec` by anything but an exact version. The release assets are npm tarballs and
     Composer zips only: a crate and a Python package are not released as an archive; they are consumed by git tag. A Go
     module tag builds and attaches nothing;
   - `make release-publish` creates the release of the tag as a draft with the archives and the section `## X.Y.Z` as
     its notes; a draft of an earlier run is replaced. GitHub accepts a release body of at most 125000 characters; a
     longer section is replaced by one line that links the section of `CHANGELOG.md` at the tag;
   - `make release-proof TAG=<tag>` proves the draft from outside the checkout: its assets, the consumer installs of
     `config/release.json` (see below), the git-tag installs and the Go modules;
   - `make release-undraft TAG=<tag>` makes the draft public, only after the proof passed. A failed step leaves the
     release a draft and fails the run.

The tests of polyspec/kit (`tests/kit/release.test.mts` and `tests/kit/release-go-tags.test.mts`) check the tool with command fakes, and
`tests/build/python-git-pins.test.mts` requires every git pin on this repository in a `pyproject.toml` to name the
version of `package.json`. `make release-coverage`
requires every `package.json`, `composer.json`, `Cargo.toml`, `pyproject.toml` and `go.mod` of the repository to be
classified in `config/release.json`.

`make release-consumer TAG=vX.Y.Z` (`node_modules/@polyspec/kit/dist/release-consumer.mjs`), which a developer runs after
`make release-assets` and the release proof runs on the draft, installs the archives of the tag from `var/release/assets` as a consumer
does, in a new temporary directory outside the repository with empty npm and Composer caches. The committed projects are
`tests/release-install/npm` (`package.json` with the tarballs as `file:` dependencies, and `package-lock.json`) and
`tests/release-install/composer` (`composer.json` with an `artifact` repository of the zips, and `composer.lock`); the
scope `@polyspec` points at the unreachable registry `http://127.0.0.1:9/`. The polyspec packages come only from the
archives; a third-party package is downloaded only as its lock pins it, by its exact version and digest. Every installed
package is required at the version of the tag, and the smoke command of `consumers` in `config/release.json` runs in the
installed project. A Go module tag releases no archive, so nothing is installed for it.
`make release-consumer-lock` writes the manifests and locks of the version from the archives, with each polyspec archive
locked by name and version, without `integrity` in npm and with an empty `shasum` in Composer.
Before the first release of the version the files name the archives of an earlier version; step 2 writes them.

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
  `packages/validator/php` and one of `packages/generator/php`, with Composer's default link, and requires
  `polyspec/crudui-validator` and `polyspec/crudui-generator` at their exact versions, so `vendor/` links each package
  to its source directory and loads it by the `autoload` of its own `composer.json`; its `autoload-dev` reads the tests
  of both PHP packages and the test classes of `tests/`. `composer.lock` beside it records the resolution, and
  `make install-composer` installs `vendor/` at the root, which PHPUnit (the bootstrap of each package is
  `vendor/autoload.php`), the PHP checks and the PHP servers load.

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
      "@polyspec/crudui-generator-html": "file:vendor/polyspec-crudui-generator-html-npm-X.Y.Z.tgz",
      "@polyspec/crudui-generator-core": "file:vendor/polyspec-crudui-generator-core-npm-X.Y.Z.tgz",
      "@polyspec/crudui-validator": "file:vendor/polyspec-crudui-validator-npm-X.Y.Z.tgz"
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
      "dist": { "type": "zip", "url": "https://github.com/polyspec/crudui/releases/download/vX.Y.Z/polyspec-crudui-validator-php-X.Y.Z.zip" },
      "autoload": { "psr-4": { "Polyspec\\Crudui\\Validator\\": "src/", "Polyspec\\Crudui\\": "src/Public/" } }
    }
  }
  ```
