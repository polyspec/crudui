# Repository settings

[한국어](repository.ko.md).

The GitHub repository settings are declared in
[`.github/repository.json`](../../.github/repository.json) and applied with one idempotent
command. The declaration covers the homepage, the repository features and merge methods, the
Actions policy and the default workflow token permissions, vulnerability alerts and automated
security fixes, the GitHub Pages build type and the `github-pages` environment, which deploys
only from `main`.

```sh
make github-settings
make github-settings-check
```

`make github-settings` reads every setting through `gh api`, changes only the ones that differ
and reads them again; it fails when anything still differs. Running it on a repository that
already matches changes nothing. `make github-settings-check` changes nothing and fails when a
setting differs from the declaration, naming the setting, its current value and the declared
value. Both commands need an authenticated `gh` with administration rights on the repository.

The remote holds only `main`. A repository created again from the same history is configured by
pushing `main` and running `make github-settings`; the documentation site is then published by
the `deploy-docs` job of the next CI run on `main`. Change a setting by editing the declaration
and running the command, never through the GitHub interface, so the declaration stays the record.

`tests/build/github-repository.test.mjs` checks the command against an in-memory repository: a
matching repository receives no request, a new repository is brought to the declaration and a
second run sends nothing, and an undeclared deployment branch is removed.
