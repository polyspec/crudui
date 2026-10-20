<!-- doc-id: rebuild-install-lock -->
# Rebuild record: install-lock

[한국어](install-lock.ko.md)

Verdict: **none fits**; crudui keeps its own implementation. Measured on 2026-10-20.

## Covers

- `scripts/install-lock.mts`

## Requirement

`npm run test:packages` installs the packed packages (`file:` tarballs) into a project of its own with `npm ci` offline from
the npm cache that `make install` fills. The lock of that project is derived from the root `package-lock.json`: each registry
package is the entry that npm resolves from the place of its dependent, so every run installs the same releases and the
install project never resolves a range against a registry.

## Tools evaluated

| Tool | State | Verdict |
|---|---|---|
| `npm install --package-lock-only` | npm 12 | resolves the ranges of the manifest against a registry, so the releases may differ from the root lock |
| `npm ci` with the root lock | npm 12 | installs the root workspace; the install project has other roots and the packed tarballs |
| `npm pack` | npm 12 | writes the tarballs, not the lock of a project that depends on them |

## Why none fits

npm has no command that derives the lock of a second project from the entries of the root lock; the commands that write a lock
resolve against a registry.

## Retry condition

Revisit when npm derives a lock from another lock without a registry.
