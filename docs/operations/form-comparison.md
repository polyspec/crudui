# Run the form comparison

[한국어](form-comparison.ko.md). See the [contract](../spec/form-comparison.md) and
[current results](../features.md).

## Start and review

Use an Apple silicon Mac with Apple container running. Run these commands from
this repository root. The Linux container uses Node 26.8.1 and PHP 8.4. Go 1.27.0 and
Rust 1.98.0 build independent server binaries for each validator source revision.

```sh
container system status
node examples/form-comparison/run.mjs start
```

Open [http://localhost:4317](http://localhost:4317). Select PHP, PHP extension, Go or Rust, then
React, Vue or Svelte. Both forms use the selected server.
The left form uses original source `1e8702a` with the empty-collection correction
`78723bb`, an example row controller and cached binding through the original
public functions. The right form uses the
13-character session implementation. Both use identical keyed data without hidden
sequence fields. The comparison selector also provides the unchanged original keyed renderer and
the earlier array diagnostic.
Generated row buttons
perform addition, copying, ordering and removal. The upper controls load, save,
validate or reset that frame's data. Expand the data sections to inspect input
names, current values, server parsing, stored records and loaded hierarchy.
The “5 → 7 → 1” control loads the nonsequential-ID fixture for manual insertion,
copying, reordering and saving.

Choose **Native form** or **JSON** in each frame's **Transmission** selector.
Save runs the existing JavaScript validator and sends the selected representation
to the selected server only when validation passes. Both choices use its existing validator and
repository. JSON requests retain the keyed structure under `form` and use
ordered-json for browser encoding, server decoding, response encoding and browser
decoding. Each server uses the same processor for stored JSON files. The dependency is
pinned to `deb1b354`; preparation downloads its source into the project cache and
records the archive hash in the source metadata. Field errors remain visible, including errors
for required fields hidden by design. The selected server validates the corresponding
source revision and stores company, store and department rows in JSON files.
Reload makes a new GET request and reconstructs nested data from persisted parent
IDs. The keyed examples apply returned key changes from descendants to parents.
The retained array example declares hidden sequence fields and clears them when
copying. The original examples update the mounted form through their rendering
interface and synchronize input properties and conditional visibility.
The array diagnostic's hidden sequence fields fail the accepted identity contract;
it is retained for inspection. Current results are recorded in feature status.

The JSON checks use the existing keyed structure and treat document member order
as row order. They test both preserving the document order and editing it before
save and reload. No ordering fields or alternative row-key format are submitted.
The separate keyed-input case verifies the original renderer and its matching server validator
without hidden identity fields.

Each server/comparison variant/framework has an independent file in
`.form-comparison/data/`, named `<server>-<variant>-<framework>.json`. APIs use
`/api/<server>/<action>/<variant>/<framework>`; for example,
`/api/go/save/keyed/react`. The Node process forwards the original request bytes.
PHP, PHP extension, Go and Rust perform their own parsing, validation, storage and reload.
Saving replaces the complete hierarchy in that file. Reset and automated checks
restore its initial records. Container removal preserves these host files.
This is a local development environment; packages are not published.

## Verify

The page's “Run all servers and frameworks” control runs the same 20 checks on the original
source with the empty-collection correction, unchanged keyed example, current
keyed runtime and retained array diagnostic in all three
frameworks and all four servers, once per transmission choice: 96 reports and
1,920 scenario results. The table shows the selected server and framework.
Results remain PASS or FAIL for each scenario. Download exports these
results. The headless runner also performs 384 real pointer, keyboard, checkbox and submission-validation
interaction checks across all 48 server/example/framework combinations and both transmission choices, plus
48 keyboard checks for addition to an empty collection in the two primary
implementations. Validation checks inspect the actual HTTP content type and JSON
body. The equivalence case saves the same edited and copied data through both
formats and compares IDs, parent relationships, positions and reloaded values.
Malformed JSON checks require a rejection without changes to saved records.
Row-operation checks use populated
records; exact and empty checks use empty departments. Empty checks cover optional
blank values, visibility, nested and complete deletion, addition after deletion,
native and JSON save/reload, and unchanged sibling IDs.
Cache checks verify one reference read and reject loading after preparation.
The headless runner also pauses each example's initial server load request and checks
that nested input elements already exist, covering all 48 server/example/framework combinations.
It also verifies that the HTML responses contain empty form containers and remain
identical across API servers. The initialization case compares 15 stages from
initial-data creation and post-mount injection, including exact HTML, complete
computed CSS, control state, ordered submissions and saved records. Repeated
injection verifies idempotence. Exported HTML and state files are stored in
`initialization-<timestamp>/<server>/<variant>/<framework>/<transport>/` under
the result directory. CSS hashes cover all element and pseudo-element properties;
failed CSS comparisons also retain the complete CSS snapshots.
Use "Check data injection idempotence" in either frame to run only this case.
Expand "Stage comparisons and original HTML" to inspect each category and download
the evidence or individual HTML files. Raw HTML and parsed DOM have separate
results; attribute order differences remain visible.
Computed CSS comparisons require the same viewport throughout a check. The
headless runner uses 1680 × 1100. Do not resize its page or connect an additional
automation client that changes the viewport during execution. Preserve and repeat
any run whose viewport changed.
For repeatable headless browser checks, install the repository dependencies and
Puppeteer's Chrome.
The runner executes one API server per browser protocol call and combines the
reports afterward. Each call keeps the 15-minute timeout. A stopped run retains
completed reports; it does not establish complete verification.
Complete report files and downloads use compact JSON because indentation of the
nested DOM snapshots exceeds the runtime string limit. Stage files remain
indented. Both formats preserve the complete snapshot values and HTML strings.

Run:

```sh
npm ci
npx puppeteer browsers install chrome
node --test tests/form-inspector/form-snapshot.test.mjs
node tests/form-inspector/browser.mjs
node examples/form-comparison/check.mjs
node examples/form-comparison/check-typing.mjs
container exec crudui-form-comparison node /workspace/keyed/examples/form-comparison/check-servers.mjs
container exec crudui-form-comparison node --test /workspace/keyed/examples/form-comparison/src/json.test.mjs
container exec crudui-form-comparison php /workspace/keyed/examples/form-comparison/test-json.php
container exec crudui-form-comparison php /workspace/keyed/examples/form-comparison/test-repository.php
make docs-check
```

The browser runner writes `report.json`, `forms.png` and `comparison.png` to
`.form-comparison/results/`. Before each run, it preserves the previous report
and screenshots with that report's timestamp. Any failed check, incomplete results or browser error
produces exit status 1. The original-array diagnostic's failures remain failures
in the report and interface; see [feature status](../features.md). Run the server, PHP and
documentation commands separately even when the browser checks fail.
The typing runner executes 36 native keyboard cases across the four variants and
three frameworks at 0, 10 and 50 ms per character. It checks immediate and settled
values, focus and caret position after a validation error, and preserves results
in `typing-report.json`.
The shared HTTP runner executes 240 checks across PHP, PHP extension, Go and Rust and all four
source variants. It covers multipart, URL-encoded and JSON round trips, identical
server results, file contents, scoped saved keys, deletion, non-reused IDs,
invalid required values, string field types, request limits, unknown fixtures,
physical record order and invalid-file preservation. It restores pre-test records
and writes `server-report.json` to `.form-comparison/results/`, retaining the prior
report with its timestamp. Run it after browser checks finish; both use the same
repositories. An optional `php`, `php-ext`, `go` or `rust` argument to `check.mjs` limits a
browser run to one server and writes separate filenames. Interrupted browser
runs save an `incomplete-*.json` report.
The PHP repository check also verifies fresh-instance loading, position-based loading
after physical record reordering, parent ownership, transaction rejection without
file changes, full deletion and non-reused IDs.

Keep both comparison implementations, snapshots and the running environment
available while verification is in progress. Repository cleanup follows
verification and review of the results.

## Inspect, rebuild and stop

```sh
container logs crudui-form-comparison
curl http://localhost:4317/api/go/load/keyed/react
curl http://localhost:4317/api/rust/load/keyed/react
curl http://localhost:4317/api/php/load/keyed/react
node examples/form-comparison/run.mjs stop
node examples/form-comparison/run.mjs start
```

To stop without rebuilding, run only the `stop` command. It removes the named comparison
container. The build and JSON files remain under `.form-comparison/` and are
excluded from Git. To prepare archives without starting a container:

```sh
node examples/form-comparison/run.mjs prepare
```

The correction commit `78723bb` is included in `main` history. Use a full clone;
preparing archives requires all pinned source commits locally.
The page exposes full source commit IDs and SHA-256 hashes of the Git archives.
The snapshots use the committed npm lockfile. The image installs matching Linux
ARM64 native build bindings separately because that lockfile contains only their
macOS package entries. It does not update the snapshots' framework dependencies.

## PHP extension target

Select `php` for the PHP processor or `php-ext` for the compiled extension.
The image builds the extension with its PHP headers. The extension process
loads `/opt/sortjson.so` explicitly; the PHP process does not load it.
Health checks and HTTP responses must report `nativeJson: false` for `php`
and `nativeJson: true` for `php-ext`. A mismatch fails startup or verification.
Repositories use separate `php-` and `php-ext-` filenames in the data volume.

After building and starting the environment, run:

```sh
node examples/form-comparison/check.mjs php-ext
container exec crudui-form-comparison node /workspace/keyed/examples/form-comparison/test-php-modes.mjs /opt/sortjson.so
container exec crudui-form-comparison node /workspace/keyed/examples/form-comparison/check-servers.mjs
```

The complete matrix includes PHP, PHP extension, Go and Rust with React, Vue
and Svelte and both transports. Existing reports from three servers do not
verify PHP extension execution.

To check an isolated container, pass its HTTP origin as the second argument:

```sh
node examples/form-comparison/check.mjs php-ext http://127.0.0.1:4318
```

The origin must identify the intended comparison environment. Reports record its
source metadata. Omitting this argument uses `http://127.0.0.1:4317`.
