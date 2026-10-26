<!-- doc-id: rebuild-documentation-web -->
# Rebuild record: documentation web

[한국어](documentation-web.ko.md)

Verdict: **none of the evaluated releases fits**; CRUDUI retains its checked Markdown renderer and documentation server.
Reviewed on 2026-10-26.

## Covers

- `scripts/docs-web/build.mts`
- `scripts/docs-web/cli.mts`
- `scripts/docs-web/paths.mts`
- `scripts/docs-web/server.mts`
- `scripts/docs-web/watch.mts`
- `scripts/documentation-links.mts`

## Requirement

The documentation commands build Markdown and generated API references, validate local targets and fragments, preserve
HTML routes and heading identifiers, and serve the same output under a checked deployment prefix. The build rejects
invalid headings, missing repository targets, symbolic links and public files that replace generated pages. Unchanged
inputs produce identical output. The development server receives file-system events and reports rebuild failures.

The site renderer must use a Markdown parser with the fix for GHSA-gfr2-rv44-r23c. The root Markdown dependency is managed
separately from a parser embedded inside another tool's distribution.

## Tools evaluated

| Tool | Evaluation | Result |
|---|---|---|
| VitePress 1.6.4 | npm stable release; installed with npm and its distributed Node chunk inspected | Its bundled reference parser appends continuation lines to a string and scans that string on every continuation. It lacks the fixed label bound and position-based continuation handling. Updating or overriding the root markdown-it package does not replace this embedded implementation. |
| VitePress 2.0.0-alpha.21 | npm next release; exact release archive inspected | Its distributed Node chunk contains the same unbounded reference-parser implementation. The prerelease does not resolve this finding. |
| Existing Markdown renderer | Existing build, link and development-server unit tests | It imports the root markdown-it package directly, so the reviewed patched parser can be selected by the root manifest and lock without editing a tool's distribution. |

VitePress provides the required route conventions, base configuration, navigation, static assets and development server.
Those capabilities make it a suitable replacement after its distributed parser contains the security fix. The bundled
parser currently prevents adopting either evaluated release. No VitePress dependency or partial conversion is retained.

## Evidence

The [security advisory](https://github.com/advisories/GHSA-gfr2-rv44-r23c) identifies markdown-it versions
`>=14.1.0 <14.3.3` and `>=15.0.0 <15.0.3` as affected. The
[parser fix](https://github.com/markdown-it/markdown-it/commit/48fbc46) replaces the repeated string accumulation with
position-based handling and bounds reference labels. The release archives inspected were obtained by
`npm pack vitepress@1.6.4` and `npm pack vitepress@2.0.0-alpha.21`. The evidence is a source comparison; no exploit timing
or VitePress site-build result is claimed.

## Retry condition

Re-evaluate the replacement when a stable VitePress release distributes a parser with the reference-parsing fix, or exposes
a supported parser dependency that can select a fixed release. Preserve the documented routes and input-rejection tests
when replacing the renderer.
