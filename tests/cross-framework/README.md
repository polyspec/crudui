# cross-framework parity gate

Direct **React == Vue == Svelte** SSR comparison. The existing parity suites
each diff ONE framework against the PHP Limepie `reference-html` fixtures
(React, Vue, Svelte vs PHP — 7/7 each). If all three equal PHP they equal each
other by transitivity, but nothing asserts that. This suite asserts it
directly: *does swapping the renderer change the HTML a user sees?* It also
catches client-only differences that have no PHP fixture to diff against.

## What it compares

The same 7 specs the PHP-parity suites use (`specs.mjs`):
`contact`, `multiple-test`, `order-form`, `product-form`, `registration`,
`user-registration`, `ProductNft`.

For each spec all THREE ordered pairs are asserted — React==Vue, Vue==Svelte,
React==Svelte — i.e. **21 cross-framework equalities** over the 7 specs. It is a
real 3-way gate, not a transitive shortcut: corrupting one framework's output
fails exactly the two pairs that touch it, leaving the third green.

## How it works (capture is per-process, comparison is here)

Loading React, Vue, and Svelte SSR in one process is unsafe: the
single-React-realm rule (see `tests/parity/capture-react.mjs` header), and the
svelte plugin transform. So the three capture legs run in **separate
processes**, each writing `out/<framework>/<name>.html` and `<name>.norm.txt`:

| leg    | runner                                   | realm / why |
|--------|------------------------------------------|-------------|
| react  | `node node-capture.mjs react`            | own React realm via `createRequire` in `capture-react.mjs` |
| vue    | `node node-capture.mjs vue`              | own Vue realm via `createRequire` in `capture-vue.mjs` |
| svelte | `vitest run --config vitest.svelte.config.mjs` | the `.svelte` SSR graph must be compiled by `@sveltejs/vite-plugin-svelte`; the prebuilt `dist` is a CLIENT bundle and crashes under `svelte/server`, so the source component (what `capture-svelte.mjs` imports) is the only working SSR path |

The coordinator `cross-framework.test.mjs` imports **no framework**. It reads
the captured artifacts and re-analyzes them with the shared
`tests/parity/normalize.js` engine (`analyzeForm` / `compareAnalyses`), so
field- and chrome-level diffs surface — not just whole-document equality.

`tests/parity/normalize.js`, `tests/parity/capture-react.mjs`,
`packages/generator-vue/test/capture-vue.mjs`, and
`packages/generator-svelte/test/capture-svelte.mjs` are imported **read-only**.
This suite writes nothing outside `tests/cross-framework/`.

## Run

No install step is required — `vitest`, the svelte plugin, and all three
frameworks resolve from the monorepo root `node_modules` (workspace hoisting).

```sh
cd tests/cross-framework
npm test            # capture all 3 frameworks, then compare (the gate)
```

Or run the legs individually:

```sh
npm run capture        # all 3 capture legs -> out/<fw>/*.{html,norm.txt}
npm run capture:react
npm run capture:vue
npm run capture:svelte
npm run compare        # coordinator only (reads out/, requires capture first)
```

`vitest run` (the raw command, no config) is NOT how to run this — each leg has
its own config. Use the npm scripts above.

## Artifacts (after a run, gitignored)

```
out/react/<name>.html     out/react/<name>.norm.txt
out/vue/<name>.html       out/vue/<name>.norm.txt
out/svelte/<name>.html    out/svelte/<name>.norm.txt
```

On a mismatch the failure prints the failing pair, the diverging line, and the
two markup fragments; the captured HTML is in `out/{react,vue,svelte}/<name>.html`.

## Current result

7/7 specs — all three frameworks produce byte-identical canonical SSR output
(21/21 cross-framework equalities). Consistent with each framework already
matching the PHP reference 7/7.
