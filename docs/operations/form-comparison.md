# Run the form comparison

[한국어](form-comparison.ko.md). See the [contract](../spec/form-comparison.md) and
[current results](../features.md).

## Start and review

Use an Apple silicon Mac with Apple container running. Run these commands from
this repository root. The build uses Node 26.8.1 and PHP 8.4 in a Linux container.

```sh
container system status
node examples/form-comparison/run.mjs start
```

Open [http://localhost:4317](http://localhost:4317). Select React, Vue or Svelte.
The left form uses original source `1e8702a` with the empty-collection correction
`78723bb`, an example row controller and cached binding through the original
public functions. The right form uses the
13-character session implementation. Both use identical keyed data without hidden
sequence fields. The comparison selector also provides the unchanged original keyed renderer and
the earlier array diagnostic.
Generated row buttons
perform addition, copying, ordering and removal. The upper controls load, save,
validate or reset that frame's data. Expand the data sections to inspect input
names, current values, PHP parsing, stored records and loaded hierarchy.
The “5 → 7 → 1” control loads the nonsequential-ID fixture for manual insertion,
copying, reordering and saving.

Save runs the existing JavaScript validator and sends native multipart fields to
PHP only when validation passes. Field errors remain visible, including errors
for required fields hidden by design. PHP validates the corresponding
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
The separate keyed-input case verifies the original renderer and its PHP validator
without hidden identity fields.

Each comparison variant/framework has an independent file in `.form-comparison/data/`.
Saving replaces the complete hierarchy in that file. Reset and automated checks
restore its initial records. Container removal preserves these host files.
This is a local development environment; packages are not published.

## Verify

The page's “Run all frameworks” control runs the same 17 checks on the original
source with the empty-collection correction, unchanged keyed example, current
keyed runtime and retained array diagnostic in all three
frameworks. Results remain PASS or FAIL for each scenario. Download exports these
results. The headless runner also performs 48 real pointer, keyboard, checkbox and submission-validation
interaction checks across all twelve examples, plus six keyboard checks for
addition to an empty collection in the two primary implementations. Row-operation checks use populated
records; exact and empty checks use empty departments. Empty checks cover optional
blank values, visibility, nested and complete deletion, addition after deletion,
native and JSON save/reload, and unchanged sibling IDs.
Cache checks verify one reference read and reject loading after preparation.
The headless runner also pauses each example's initial PHP load request and checks
that nested input elements already exist, covering all twelve example/framework pairs.
For repeatable headless browser checks, install the repository dependencies and
Puppeteer's Chrome, then run:

```sh
npm ci
npx puppeteer browsers install chrome
node examples/form-comparison/check.mjs
container exec crudui-form-comparison php /workspace/keyed/examples/form-comparison/test-repository.php
make docs-check
```

The browser runner writes `report.json`, `forms.png` and `comparison.png` to
`.form-comparison/results/`. Before each run, it preserves the previous report
and screenshots with that report's timestamp. Any failed check, incomplete results or browser error
produces exit status 1. The original-array diagnostic's failures remain failures
in the report and interface; see [feature status](../features.md). Run the PHP and
documentation commands separately even when the browser checks fail.
The repository check also verifies fresh-instance loading, position-based loading
after physical record reordering, parent ownership, transaction rejection without
file changes, full deletion and non-reused IDs.

Keep both comparison implementations, snapshots and the running environment
available while verification is in progress. Repository cleanup follows
verification and review of the results.

## Inspect, rebuild and stop

```sh
container logs crudui-form-comparison
curl http://localhost:4317/api/load/keyed/react
node examples/form-comparison/run.mjs stop
node examples/form-comparison/run.mjs start
```

To stop without rebuilding, run only the `stop` command. It removes the named comparison
container. The build and JSON files remain under `.form-comparison/` and are
excluded from Git. To prepare archives without starting a container:

```sh
node examples/form-comparison/run.mjs prepare
```

The correction source is retained on branch `fix/original-empty-collections`;
its commit must be present locally when preparing archives.
The page exposes full source commit IDs and SHA-256 hashes of the Git archives.
The snapshots use the committed npm lockfile. The image installs matching Linux
ARM64 native build bindings separately because that lockfile contains only their
macOS package entries. It does not update the snapshots' framework dependencies.
