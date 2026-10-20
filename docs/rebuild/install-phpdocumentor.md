<!-- doc-id: rebuild-install-phpdocumentor -->
# Rebuild record: install-phpdocumentor

[한국어](install-phpdocumentor.ko.md)

Verdict: **none fits**; crudui keeps its own implementation. Measured on 2026-10-20.

## Covers

- `scripts/install-phpdocumentor.mts`

## Requirement

`scripts/gen-api-docs.mts` runs a pinned phpDocumentor release. The tool is installed into `var/tools/phpdocumentor` at the
SHA-256 of its release asset, so every run documents with the same release.

## Tools evaluated

| Tool | State | Verdict |
|---|---|---|
| mise | 2026.10.8 | `mise registry` lists `php` and no phpDocumentor or Phive entry (`mise registry` filtered for `php`, `phive` and `phpdoc`) |
| `composer require phpdocumentor/phpdocumentor` | composer 2.10.3 | measured with `--dry-run` in an empty project: no version is installable, because each depends on a release that the security advisories block (symfony/validator ~2.2, league/commonmark ^1.5, league/flysystem ^1.0) |
| Phive | not installed | not in the mise registry, so it is not in the toolchain |

## Why none fits

The toolchain installs no phpDocumentor, and Composer cannot install it without disabling the advisory blocking of the
repository. The release phar, checked by its digest, is the only supported way left.

## Retry condition

Revisit when mise lists phpDocumentor or a phpDocumentor release installs through Composer under the advisory policy.
