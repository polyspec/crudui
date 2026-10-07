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
   `Cargo.toml`, `VERSION` and `pyproject.toml` of the repository, and of every dependency on a package of the
   repository, to X.Y.Z, and renames `## Unreleased` of `CHANGELOG.md` and `CHANGELOG.ko.md` to `## X.Y.Z` below a new
   empty `## Unreleased`. The Composer manifests declare no version; Composer reads it from the tag.
2. After the merge queue merged it, the maintainer tags that commit of `main` and pushes the tag:

   ```sh
   git tag vX.Y.Z <commit of main>
   git push origin vX.Y.Z
   ```

3. `.github/workflows/release.yml` runs on the pushed tag (`tags: ['v*', '**/v*']`: in a tag filter `*` does not
   match `/`, so `**/v*` covers `packages/<directory>/vX.Y.Z`), with the token permission `contents: write`. After the
   setup steps (`make install-npm`, `make toolchain-check TOOLS="node npm"`, `make install-node-modules`) its last four
   steps run `scripts/release.mjs` through make in this order, each with the tag of the environment variable `TAG`,
   which the recipe passes as `"$$TAG"`:
   - `make release-verify` requires the commit of the tag on `origin/main` (`git merge-base --is-ancestor`) and the
     check runs `push-gate` and `ci-passed` of the commit completed with conclusion `success`
     (`gh api repos/<owner>/<repo>/commits/<sha>/check-runs`); it fails with each missing or failed check;
   - `make release-versions` requires the version of the tag in every package file that the tag covers and the section
     `## X.Y.Z` of `CHANGELOG.md`; it fails with the file and both versions;
   - `make release-assets` runs `make build` and writes the archives of `packages/` to `var/release/assets`: `npm pack`
     of every npm package that is not private and `git archive` of every Composer package directory as a zip, each
     named `<package>-<version>.<extension>` with `@scope/` and `vendor/` written `scope-` and `vendor-`. The release
     assets are npm tarballs and Composer zips only: a crate is not released as an archive; it is consumed by git tag,
     because `cargo package` rewrites git dependencies into crates.io requirements that do not resolve. A Go module
     tag builds and attaches nothing;
   - `make release-publish` runs `gh release create <tag> --verify-tag --title <tag> --notes-file <section ## X.Y.Z>`
     with the archives. GitHub accepts a release body of at most 125000 characters; a longer section is replaced by
     the line `The changes of X.Y.Z are listed in [CHANGELOG.md](https://github.com/polyspec/crudui/blob/<tag>/CHANGELOG.md#XYZ).`,
     whose anchor is the version without its dots.

`tests/build/release.test.mjs` checks the script with command fakes: a version that differs from the tag, a missing
change log section, a check run that is missing, in progress or failed, a commit outside `main`, the archive names and
commands, a Go module tag that runs no command, and the release command; it also requires one version in every package
file of the repository and lists how a tag releases each package file of `packages/`.
