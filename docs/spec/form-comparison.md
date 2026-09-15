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
The form-comparison CI job installs the root npm graph and the Composer graphs
for the PHP validator and generator before it runs the source and generator
construction suites. A clean checkout does not use an ignored `vendor/` directory.

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

The `ssr` action serves the frame document of one rendering path and framework. Its
query is exactly `lang` (`ko` or `en`), `server` (the responding runtime) and
`initialization=ssr`, each once; every other query is rejected with `Expected lang,
server and initialization for this SSR frame`. The server reads the built frame page
`{public}/frames/{renderingPath}-{framework}/index.html`, which must contain exactly one
`<html>` start tag, one empty form view `<div id="form-view"></div>` and one `</body>`;
every other document is rejected with `The frame document must contain one html start
tag, one empty form view and one body end tag`. The response is that page with three
insertions and no other change: the language on the html start tag, the form rendered
from the stored record inside the form view, and the record and generator provenance as
`<script type="application/json" id="crudui-ssr">` immediately before the body end tag,
with `<`, `>` and `&` written as JSON escapes. It is sent as `text/html; charset=utf-8`
with `Cache-Control: no-store`.

The browser runs the `bindForm` and `createForm` rendering paths. Both paths use
the same packages from the candidate commit, the same keyed data and the same
submission contract. The selected server compiles one data-independent template,
and the browser restores that template from JSON. The `bindForm` path evaluates
field models from the template and current data; its application controller
updates keyed data and binds the fields again after input and row operations. The
`createForm` path creates an editable form session from the same template and uses
the session for data replacement and row operations. Compile failures are returned
as failures; the browser does not compile a replacement template.

The main page selects a server, framework and rendering path and shows server-side
and client-side rendering of the same form side by side, with the same template,
record and language. The left frame (`initialization=ssr`) is the frame document of the
selected server (PHP, the PHP extension, Go or Rust): it arrives with the form already
rendered from the saved record and with that record in its payload, and the selected
framework hydrates the form with the same template and data. Hydration must leave the
parsed form DOM unchanged: every element, attribute value and text in child order.
Attribute order is not part of the DOM (React sets `type`, `value` and `name` after
other input attributes), so it is not compared; the string renderers' byte-identical
HTML is checked by the generation and native generation checks. A `style` attribute is a CSS declaration
block, so it is compared as the CSS object model serializes its declarations: React
writes a sticky row's `--crudui-sticky-depth:0` as `--crudui-sticky-depth: 0;`. The comparison leaves out the nodes frameworks
keep as rendering anchors, which render nothing: comments (Vue) and empty text nodes
(Svelte). Each adapter declares what hydration does with the server-rendered nodes:
React, Vue and the HTML renderer adopt them, and the frame requires every one of them
to survive; Svelte hydrates only markup its own server renderer wrote, which carries
`<!--[-->` markers the form servers do not write, so it clears the container and mounts
its own nodes. The right frame (`initialization=csr`) is the built frame page: the
framework mounts the form without data before it requests the saved record, then injects
the record into the existing form. A frame URL without `lang`, `server` and
`initialization` fails. Frames load `@crudui/generator-core/crudui.css` before the page
stylesheet, so computed CSS is compared with the grammar styles; the page stylesheet
does not style anything inside `#view`. Inside that compared element each frame renders
the form in `#form-view` and the browser-only structure map and data view in
`#outline-view` and `#data-view`; the servers render the form alone.

The `bindForm` controller supports the same actions as a `createForm` instance:
row operations, `toggle-row`, `select-row`, `expand-all`, `collapse-all` and
`undo`. It keeps collapsed rows and the undo history outside the keyed data using
generator-core's view-state and history functions, and moves or keeps focus by the
form runtime's focus rule.

The complete browser matrix contains 64 scenario reports and 32 initialization
reports:

- four servers: PHP, PHP extension, Go and Rust;
- four frameworks: React, Vue, Svelte and the HTML renderer;
- two rendering paths: `bindForm` and `createForm`;
- two transports for scenario reports: native multipart form and ordered JSON.

Every report uses the same specification, compiled template, data and checks.
Scenario checks run in the `ssr` frame.
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
- cached structure reuse and compile-request stability.

Each initialization report runs 18 stages in the left frame, resets the
repository, then runs the same stages in the right frame. Row key inputs repeat
from the `copied` stage to `saved-new` in both runs, so both columns create the
same keys. The stages are:

- `mounted`: reset the repository, then load the column's frame document again so it
  initializes through its own path: hydrate the server-rendered form (left) or mount and
  inject (right);
- `reinjected-1`, `reinjected-2`: inject the saved record again with the same
  cached template;
- `data-hidden`, `data-restored`: inject a record that hides a conditional field,
  then the saved record;
- `edited`: edit the company name, store name and notes, and toggle the checkbox;
- `saved`: save and record the validation result, stored records and key changes;
- `reloaded`: reload the saved record;
- `copied`, `moved`, `copy-removed`, `added`: copy, move, remove and add company
  rows through their buttons, editing the added row;
- `saved-new`: save the added row;
- `collapsed-all`, `expanded-all`, `undone`: press the structure map's Collapse
  all, Expand all and Undo buttons;
- `empty`, `restored`: inject an empty company collection, then the saved record.

Stages focus controls as a keyboard user does, with visible focus
(`focus({ focusVisible: true })`). A browser shows no focus for a scripted focus after
pointer input in the same document, so a click inside one frame before the comparison
would otherwise change only that column's CSS.

Both columns must receive the same input, and a pointer rests over one frame only. No page
style keeps `:hover` out of a frame in every browser: in Safari neither `pointer-events: none`
on the frame nor an element covering it does. A capture therefore requires the pointer to be
outside both frames. When the pointer is over a frame (its document element matches
`:hover`), the comparison stops without a result and asks to move the pointer outside the
frames and compare again; the list shown after loading says the same instead of comparing.
The page itself never scrolls, so a resting pointer stays where it is relative to the frames:
the controls and results scroll inside a panel limited to 45% of the viewport height, and the
two frames share the rest, side by side (stacked halves below 1000 px), each scrolling inside.
A runtime focus move then scrolls only its frame. With frames stacked in a scrolling page,
Safari scrolled the page from 0 to 602 px when the `copied` stage moved focus, bringing the
left frame under a pointer resting on the page header.

Each right stage is compared with the stored left stage using `formSnapshot`,
`styleSnapshot` and `compareSnapshots`: parsed DOM with every attribute, live
control state, native fields, computed CSS for elements and pseudo-elements, ordered
JSON data, focus and text selection, and the save response. Serialized HTML is not
compared: attribute order is not part of the DOM, and browser engines create the
attributes a framework sets in different orders (Safari and Chromium order a restored
Vue checkbox's `checked` and `value` differently). Each column's reinjection and
restoration stages are also compared with its own `mounted` stage. Nothing is
removed, replaced or normalized. The report has 24 comparisons in seven categories,
168 results.

The page shows both frames. After both frames load, the top list compares their
`mounted` state; the comparison button and the complete check add each stage as
it completes. The report retains each stage's HTML, DOM, control state, fields,
data, focus, response and CSS digest, and the expected and actual CSS of any
failed CSS comparison.

Both frames, the page and every other tab of the same origin read and replace the
same saved records. An operation started from the page changes them only while it
holds one origin lock (`navigator.locks`): a frame button or form submission, the
comparison button and the complete check. An operation started while another holds
the lock does not run and reports that another check or save is running. Checks
that the complete check or the verifier calls directly run inside the operation
that already holds the lock. The lock belongs to one browser: other browsers, other
people and automated runs against the same deployment also read and replace these
records without it, so checks from different browsers must not run at the same time.

Pointer and keyboard checks verify that a row addition focuses the first input of
the new row and that the input is visible inside both the frame viewport and the
main page viewport; the frame and the page scroll only as far as needed.
Frame-document checks cover both initialization documents of every rendering path and
framework. A CSR document must be the built frame page with empty views and no payload,
and an SSR document must be that same page with only the three insertions; the pages
behind all four servers' documents are compared by SHA-256. Generation verification
checks Korean and English SSR output for every server and framework, and that every
server rejects the same wrong SSR queries with the same message.

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

A complete server report requires a browser job of 24 reports: 16 scenario
reports with 19 checks each and eight initialization reports with 168 comparison
results each. It also requires 80 interaction checks, eight mount-before-load checks
of the `csr` frame, 16 frame-document checks, no browser or page errors, one
matching candidate commit for both rendering paths and a duration within 900,000
milliseconds. Fields named `passed` must be booleans. Missing activity,
initialization stages or timing evidence makes the report incomplete.

The four-server aggregate requires one complete report from every server. It
requires 1,216 successful scenario checks, 5,376 successful initialization
comparisons, 320 successful interaction checks, 32
successful mount checks, 64 successful frame-document checks, equal frame pages behind
every server's documents and four successful performance results. Any failed,
missing, malformed or unequal result sets `passed: false` and returns status 1.
Only a complete aggregate with zero failures returns status 0.

## Additional verification

Generation verification requires 450 successful results, 899 HTTP requests and
all 32 server/rendering-path/framework combinations. Repository verification
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
