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
`main` receives. Change a setting by editing the declaration and running the command, never through
the GitHub interface, so the declaration stays the record.

`tests/build/github-repository.test.mjs` checks the command against an in-memory repository: a
matching repository receives no request, a new repository is brought to the declaration and a
second run sends nothing, an undeclared deployment branch is removed, the order of rules, checks and
merge methods is not a difference, a ruleset that differs is replaced by its id and another ruleset
is kept, and two rulesets of the name fail. It also requires the checks of the ruleset to be the jobs
of the push check and of the CI workflow, one per matrix entry.

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
  of every job of `.github/workflows/ci.yml`, one per matrix entry, all of the GitHub Actions app
  (integration 15368).

A direct `git push origin <commit>:main` is refused with `GH013: Repository rule violations found`.
The pre-push hook runs on the push of the branch. `gh pr merge --auto` adds the pull request to the
merge queue once its required checks pass on the pull request. The queue rebases it onto `main` as a
merge group on the branch `gh-readonly-queue/main/pr-<number>-<sha>`, both workflows run on that
commit (`merge_group`), and the queue moves `main` to exactly that commit when the checks pass; a
failed check removes the pull request from the queue, and `main` does not move. A run of the CI
workflow for a merge group is never cancelled: each group has a ref of its own, and
`cancel-in-progress` holds only for pull requests. The rebase gives the merged commits new hashes;
`git pull --rebase` drops the local commits that the queue merged.
