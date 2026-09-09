# Form verification

[한국어](verification.ko.md).

Run the maintained package and form checks from the repository root:

```sh
npm run test:forms
node --test tests/form-inspector/form-snapshot.test.mjs
node tests/form-inspector/browser.mjs
npm run test:packages
make docs-check
```

The form inspector compares raw HTML, parsed DOM, computed styles and live
control state without modifying the inspected form. Framework initialization
tests compare initial data with later injection and record restoration.
[JSON order checks](ordered-json.md) verify the transport representation separately.

Current HTTP and browser integration uses an independent external checkout. That
checkout also retains the historical comparison implementations and their
results. From this repository root, provide the comparison path and resolve the
exact committed library revision explicitly:

```sh
LIBRARY_WORKSPACE=$(pwd)
LIBRARY_REF=$(git rev-parse HEAD)
COMPARISON_WORKSPACE=/absolute/path/to/crudui-comparison
cd "$COMPARISON_WORKSPACE"
node examples/form-comparison/prepare.mjs --library "$LIBRARY_WORKSPACE" --ref "$LIBRARY_REF"
```

Preparation archives `LIBRARY_REF`; it does not include uncommitted library
changes. The comparison checkout's `docs/operations/form-comparison.md` defines
candidate image construction and verification. Its Compose configuration still
identifies the retained `dfe70a6` deployment until a new image has passed the
complete checks. Starting that retained image does not verify the current source.

The current targets are PHP using Composer classes, PHP extension using both
`ordered_json.so` and `crudui.so`, Go and Rust. Each provides compile, render and
SSR endpoints and is checked with React, Vue and Svelte. The browser receives a
serialized server-compiled template; it does not hydrate arbitrary native HTML.
Focused local verification of this connection passed all seven server-generation
unit tests, the complete Go server package, all four Rust server tests and
production builds for 12 React, Vue and Svelte frame combinations. These results
verify the implemented connection, not a candidate image.
After a candidate image is selected and started, run the generation checks inside
that container:

```sh
container exec crudui-comparison node /workspace/keyed/examples/form-comparison/test-php-modes.mjs /opt/ordered_json.so /opt/crudui.so /workspace/keyed
container exec crudui-comparison node /workspace/keyed/examples/form-comparison/check-generation.mjs --url http://127.0.0.1:8080 --library /workspace/keyed --report /results/generation-current-new.json
container exec crudui-comparison node /workspace/keyed/examples/form-comparison/check-servers.mjs
container exec crudui-comparison node --test /workspace/keyed/examples/form-comparison/src/json.test.mjs
```

The complete generation check requires 146 results, 207 requests and all 12
server/framework combinations. It separately checks compile and render, raw SSR
HTML, English and Korean responses, submission, persistence and invalid-request
rejection. These requirements remain pending until the candidate report records a
complete run. After deployment, representative SSR documents are the
[English PHP/React form](https://crudui.test/api/php/ssr/keyed/react?language=en)
and [Korean PHP/React form](https://crudui.test/api/php/ssr/keyed/react?language=ko);
the server and framework path segments select the other combinations.

The retained modes preserve PHP with native JSON parsing, Go and Rust at their
recorded revisions. That historical PHP target still uses PHP validation and does
not verify the [CRUDUI extension](../spec/php-extension.md). Retained failures and
source metadata remain unchanged. A successful current implementation does not
change a historical result, and external results do not verify later source
changes automatically.

After the verified image is recorded in Compose, `containerctl up` returns after
startup health checks and HTTPS route updates. Apply that same configuration again
and compare container inspection, proxy state, certificates, storage hashes and
HTTP responses to check environment idempotence. Record this separately from form
data-injection equivalence.
