# Form verification

[한국어](form-comparison.ko.md).

This contract defines the repository's HTTP, browser and persistence verification
for nested forms. The implementation and its verifier are stored in this
repository. Verification uses one exact committed revision and does not read
source files from another checkout.

## Source and environment

Preparation requires a clean worktree and an explicit commit. It creates one Git
archive of the complete repository at that commit. Metadata records the commit
and SHA-256 digest of the archive. Image construction verifies the digest and
embedded Git commit before extraction. The verifier, servers and packages all
come from this archive. Uncommitted files, earlier repository revisions, source
patches and files from another checkout cannot enter a candidate image.

Candidate data, reports and image tags are separate from deployed data. Building
or checking a candidate does not change the deployed service. Deployment is
allowed only after the candidate aggregate returns status 0 and records
`passed: true`.

Candidate verification manages its complete local artifact lifecycle. Before it
prepares a commit, it removes candidate containers, image tags and directories
from earlier runs. It never removes the active deployment container, image or
data. While a candidate runs, its commit-specific directory may contain build
context, mutable test data, individual reports and screenshots.

Candidate verification resolves the container executable from one installed
package record. The record identifies one versioned installation directory and
one regular executable file. Relative paths, symbolic links, missing records,
multiple matching records and alternate command providers are rejected. Runtime
resolution does not try another path after an invalid result.

Image construction uses one PHP extension builder for `crudui.so` and
`ordered_json.so`. Each extension has an explicit build entry point and declares
its sources, module name, output directory and load check. The builder reads the
PHP executable, headers and build flags from one `php-config` executable and
compiles both modules directly without `phpize`, Autoconf or libtool. It resolves
each required executable once before compilation. Relative paths, symbolic links,
missing tools, multiple discovery results and PHP installation mismatches fail
the build. A failed command does not select another executable or build path.
Generated build and module paths contain only regular files and directories.
The Linux candidate declares its versioned `php-config` file and selects the C
compiler from one installed Debian `gcc` package record.

When every candidate check succeeds, verification stops and removes the
candidate container. It retains only the candidate image and these deployment
inputs: `context/metadata.json`, `results/generation.json`,
`results/server-report.json` and `results/browser-summary.json`. It removes the
candidate build context, mutable data, individual browser reports, screenshots
and every candidate artifact for another commit. When preparation, construction,
startup or any check fails, verification writes the failure and available
container log to standard error, then removes the failed candidate container,
image and directory. A completed run does not retain raw test output for later
diagnosis.

Image construction runs compilation and source checks that do not start a
browser process. The construction environment does not provide the namespace
contract required by the Chromium sandbox. After the image starts, the complete
source suite, including the Chromium process check, runs as the unprivileged
application user with the Chromium sandbox enabled. A candidate fails when
either the construction checks or the complete runtime source suite fails.

Each child server publishes one readiness event after binding its listening
socket. The parent waits for those events and then sends one health request to
each child to verify its source and implementation. After the public server
binds its socket, it atomically publishes one candidate readiness file. The host
subscribes to that file before starting the container and waits for either the
file event or container termination. Startup uses no sleep interval, retry loop
or periodic health request.

Browser verification registers the host callback for main-page readiness before
navigating. The main page publishes readiness after both initial comparison
frames publish their readiness events. The verifier waits for the host callback
without keeping a browser evaluation call open. Every module copied directly to
the public directory uses only browser-resolvable imports. Source verification
loads those modules in Chromium. A script error, page failure or page close before
main-page readiness rejects the current server run and records the failure. The
readiness wait does not remain pending after an observed initialization failure.
The verifier also subscribes to the exact job and renderer events before it starts
the corresponding operation. It awaits the operation promise and the renderer
completion signal before reading the result. It does not infer page readiness,
frame readiness, validation completion or rendering completion from periodic DOM
reads or elapsed time. A time limit may fail a browser operation that stops
publishing progress, but reaching that limit cannot produce a successful result.

## Implementations and requests

PHP, the PHP extension, Go and Rust implement the same compile, render,
validation, persistence and SSR request contract. Each server uses its own
generator and validator. The PHP extension process loads `crudui.so` and
`ordered_json.so`; the PHP process loads neither extension. Startup rejects an
unexpected class source, module digest or repository commit.
The PHP process reads the validator installation directory from
`packages/generator-php/vendor/composer/installed.php` in the candidate source.
This file is the authoritative installed-package record for the selected
generator autoloader. Records registered by other Composer installations do not
affect package selection. The record file, installation directory and validator
class must use regular paths without symbolic links. The validator class must
match the corresponding source file in the candidate archive. The process
rejects a missing or malformed selected package record, an external installation
directory or a different installed file.
Every PHP provenance response from health, generation and SSR reports `Generator`
and `Form` from the generator source directory and `Validator` from the selected
Composer installation directory. Startup and result verification use one class
location contract and accept only these reported locations after the source
comparison has passed.
When startup rejects a health response, the failure identifies the server and
the first response field that does not meet this contract.

The public API accepts only
`/api/{server}/{action}/{renderingPath}/{framework}`. The public process starts
exactly one PHP process, one PHP extension process, one Go process and one Rust
process. It forwards each accepted request to the selected process as
`/api/{action}/{renderingPath}/{framework}`. The API contains no implementation
revision or data-shape segment. `bindForm` and `createForm` select the rendering
and editing path. Keyed objects define repeated instance data and do not select
an implementation or URL.

The browser runs the `bindForm` and `createForm` rendering paths. Both paths use
the same packages from the candidate commit, the same keyed data and the same
submission contract. The selected server compiles one data-independent template,
and the browser restores that template from JSON. The `bindForm` path evaluates
field models from the template and current data; its application controller
updates keyed data and binds the fields again after input and row operations. The
`createForm` path creates an editable form session from the same template and uses
the session for data replacement and row operations. Each frame mounts a form
before it requests saved data, then injects the data into the existing rendering
path. Compile failures are returned as failures; the browser does not compile a
replacement template.

The complete browser matrix contains these 48 scenario reports:

- four servers: PHP, PHP extension, Go and Rust;
- three frameworks: React, Vue and Svelte;
- two transports: native multipart form and ordered JSON.
- two rendering paths: `bindForm` and `createForm`.

Every report uses the same specification, compiled template, data and checks.
Native and JSON saves must produce the same records, identifiers, parent
identifiers and positions. Ordered JSON preserves object member order at every
depth.

## Structure, data and identity

Structure compilation, instance data, rendering and validation are separate.
The compiled template contains no record values, is JSON-serializable and is
reused after compilation becomes unavailable. Repeated data injection, editing
and remounting do not add compile requests for an existing cache key.

Repeated collections are objects keyed by row identity. A saved sequence uses
`__` plus 13 decimal digits plus `__`. A new unsaved row uses `__` plus 13
lowercase hexadecimal digits plus `__`. A key identifies a row within its
parent collection; object member order determines display order. The runtime
does not infer saved state from key text.

Submissions contain no hidden sequence controls, auxiliary identity fields or
order fields. The server resolves an existing key only against stored rows under
the same parent. It allocates a new sequence for an unknown key and returns the
scoped key change. Deleted sequences are not reused.

An explicit empty object represents an empty collection and produces no row
controls. Missing collection data creates one initial row. Every visible empty
collection provides an Add button. Visibility changes do not create, remove or
submit data. A hidden collection with rows still submits those rows.

## Browser checks

Each scenario report checks all of the following operations:

- rendering, native names and zero hidden identity controls;
- addition, copying, movement, removal and saved-key replacement;
- nonsequential saved identifiers in the order 5, 7 and 1;
- client and server validation, including hidden required fields;
- native and JSON transmission, malformed request rejection and exact reload;
- empty company, store and department collection lifecycles;
- parent ownership, stable sibling identifiers and non-reused deleted IDs;
- cached structure reuse and compile-request stability;
- initialization with data compared with mount-then-inject.

Initialization comparison records raw HTML, parsed DOM, every attribute, live
control state, native fields, ordered JSON data, focus, selection, computed CSS
for elements and pseudo-elements, validation results and stored records. It
compares both initialization paths at every stage without removing or replacing
identifiers, attributes, styles or values. Repeated injection must be idempotent.

Pointer and keyboard checks verify focus, selection and scroll preservation.
Static browser-entry checks cover both rendering paths and every framework and
compare corresponding documents from all four servers by SHA-256. Generation
verification checks Korean and English SSR output for every server and
framework.

## Runner and reports

The browser starts a job and the host collects state and completed reports with
short protocol calls. A long matrix never occupies one DevTools protocol call.
The collector records the current report, report start time, completed report
count, request and response counts, and last request and response times.

A server run has an absolute limit of 900,000 milliseconds. The collector stops
the run when elapsed time exceeds that limit, even if requests are still active.
It also fails after 300,000 milliseconds without a change to the current report,
completed report count, request count or response count. Both failures retain
the current state and every completed report.

A complete server report requires 12 scenario reports, 60 interaction checks,
six mount-before-load checks, six static-document checks, no browser or page
errors, one matching candidate commit for both rendering paths and a duration
within 900,000 milliseconds. Fields named `passed` must be booleans. Missing
activity, initialization or timing evidence makes the report incomplete.

The four-server aggregate requires one complete report from every server. It
requires 960 successful scenario checks, 240 successful interaction checks, 24
successful mount checks, 24 successful static-document checks, equal corresponding
static SSR documents across servers and four successful performance results. Any failed,
missing, malformed or unequal result sets `passed: false` and returns status 1.
Only a complete aggregate with zero failures returns status 0.

## Additional verification

Generation verification requires 290 successful results, 411 HTTP requests and
all 24 server/rendering-path/framework combinations. Repository verification
checks atomic updates, locking, position-based loading, parent ownership,
rejection without file changes, complete deletion and sequence allocation. Type
verification checks the same scalar and collection rules in every server.

Fast source tests reproduce report-policy failures, protocol timeout behavior,
absolute and stalled job limits, source archive changes, snapshot differences,
generation cache behavior and request-count changes. These tests do not replace
the complete candidate matrix. Pull request and `main` push CI runs
`npm run test:form-comparison` so report-policy, browser-job, candidate-source
and generation-performance regressions block integration.

## Deployment

The repository creates the local comparison deployment only from an explicit
40-character candidate commit. The candidate metadata, generation report,
persistence report and four-server browser aggregate must identify that commit
and satisfy every count and pass condition in this specification. The local
image reference uses the first 12 characters of the commit as its complete tag,
and the deployment record stores the resolved image digest. Missing, stale,
failed or malformed evidence prevents deployment.

Deployment state is stored under `.form-comparison/deployment/` in this
repository. The generated Compose file mounts only its `data` directory, serves
`crudui.test`, and checks `/api/health` and `/metadata.json` against the
selected candidate commit. Browser reports, screenshots and other candidate
results are verification inputs, not deployment state.
The startup health check provides at least 120 seconds for the four servers to
become ready. Its retry count remains within containerctl's supported range of
1 through 100.

After applying the generated Compose file, verification requests the HTTPS home
page, health response, metadata and one saved-data response. It verifies the
route certificate, deployed image digest, source commit, mounted paths and stored
files. It then applies the same Compose file again. The second application must
retain the container identity, creation and start times, image digest, data
mount, route, certificate, stored files and response bytes. Any change or failed
request makes deployment verification fail.

After deployment verification succeeds, the repository retains the deployment
commit, image digest, report totals, data digests and identical-application
result. It removes candidate containers, candidate directories, raw reports,
screenshots and local comparison images that the deployed service does not use.
If deployment verification fails, it retains the verified candidate's four
deployment inputs and image for a retry. It does not remove or replace the last
verified deployment record as part of artifact cleanup.
