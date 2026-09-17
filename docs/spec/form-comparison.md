# Form verification

[한국어](form-comparison.ko.md).

This contract defines the repository's HTTP, browser and persistence verification
for nested forms. The implementation and its verifier are stored in this
repository. Verification runs against the current repository tree, committed or
not, and records that tree's source identity. It does not read source files from
another checkout.

## Canonical example and benchmark boundary

The public root is the full CRUDUI feature example. It presents one record flow,
`List → Detail → Form → Save → List refresh`, over the one record resource below. CRUDUI
generates the list, detail, links, form, validation and submission of that record. The page
selects one of five servers: `js` (the public Node server itself), `php`, `php-ext` (PHP with
the CRUDUI and OrderedJSON extensions), `go` and `rust`; one of four clients: `html`, `react`,
`vue` and `svelte`; the initialization, `csr` or `ssr`; and the form mode, `bindForm` or
`createForm`. External stage buttons, parent-side fake stage routing and form frames are not
part of the page.

`/benchmark-console/` and `/benchmark/` are separate verification screens. They own the nested
companies scenario (`src/scenario.mjs`), the render and validation matrices, the side-by-side
initialization comparison and the benchmark controls; the companies scenario is used nowhere
else. The canonical page embeds none of them. `/displays/` is not a route.

## Record resource

**Specifications.** `examples/form-comparison/fixtures/customer-specs.json` holds the three
specifications of the customer record: `list`, `detail` and `form`. The record members are
`id`, `name`, `status`, `joined`, `score`, `relation.name`, `avatar` and `markup`. The list
shows every member and links each record to its detail; the detail shows every member except
`avatar` and links the record to its form; the form edits `name`, `status`, `joined`, `score`,
`relation.name` and `markup`, shows `id` read-only (`dummy-input`) and has no `avatar` field.
The list declares no sort: it shows the records in store order.

**Fixture.** `examples/form-comparison/fixtures/customer-records.json` holds the 45 seeded
records in id order, `"1"` to `"45"`, with `score` as a JSON number. The build publishes both
files unchanged in the public directory as `customer-records.json` and `customer-specs.json`,
and every server reads them from there. No program keeps its own copy of the records.

**Store.** Every server owns one persistent store, `records-{server}.json` in its data
directory (`/data` in the container). The file holds the records array in id order, with the
member order of the fixture. A missing file is seeded from the fixture on its first read; an
unreadable or malformed file fails the request and is not replaced. Writes are serialized: the
JavaScript server queues them in its one process, and the PHP, Go and Rust servers take an
exclusive lock on `records-{server}.json.lock` for the read and the write. A write
replaces the file atomically through a temporary file in the same directory. Saved values are what the list, the
detail and the form show next, also after a restart.

**HTTP contract.** The paths below are each server's own paths. The public server forwards
`/api/{server}/records…` for `php`, `php-ext`, `go` and `rust` to `/api/records…` of that
server and answers `/api/js/records…` itself. Every JSON response is
`application/json; charset=utf-8` with `Cache-Control: no-store` and names the responding
server in `server`. Every failure is `{ "error": message, "server": … }`.

| Request | Success | Failure |
| --- | --- | --- |
| `GET /api/records?page={n}` | 200 `{ page, perPage: 20, total, records }`: page `n` in id order | 400 `Expected one page parameter` unless the query is exactly one `page`, a decimal integer from 1 without sign or leading zero; 404 `Page not found` beyond the last page |
| `GET /api/records/{id}` | 200 `{ record }` | 404 `Record not found` for an id that is not stored, including `0` and an id with a leading zero |
| `POST /api/records/{id}` | 200 `{ record, validation: { valid: true, errors: [] } }` | below |
| `POST /api/records/reset` | 200 `{ total: 45 }`; the store equals the fixture | 400 for a request with a body |
| `GET /api/records/view/{view}?…` | 200 `{ view, html, data }` | below |

Another method on these paths answers 405.

A save accepts the native form, `multipart/form-data` or `application/x-www-form-urlencoded`
with exactly the fields `form[…]` and `_form_complete=1` as the rendered form posts them, and
JSON with exactly the member `form`: `{ "form": { … } }`; another field or member answers 400. The submitted object has exactly the form members `id`, `name`, `status`,
`joined`, `score`, `relation` (with exactly `name`) and `markup`, each a string. The server
answers 404 for an unknown id, 415 for another media type, 413 above 2 MiB, and 400 for
malformed input, a missing completion field, a missing, additional or non-text member, or an
`id` other than the path id. It then validates the submission with its own validator and the
`form` specification; an invalid submission answers 422 `{ validation }` with the validator's
result. A valid submission stores the previous record with the submitted `name`, `status`,
`joined`, `relation.name` and `markup`, and `score` as the JSON number its decimal text
denotes; `id` and `avatar` keep their stored values. No failure changes the store file. A store
file that cannot be read as the record list answers 500 and is left as it is.

A view request renders one stage of an SSR document. Its query is exactly `lang` (`ko` or
`en`), `server` (the responding server), `framework`, `initialization=ssr`, `mode` and `page`,
each once and in this order, preceded by `id` for `detail` and `form`; any other query, and an
`id` that is not a decimal integer from 1 without sign or leading zero, answers 400. An unknown
view, a page beyond the last page and a well-formed id that is not stored answer 404. In
`/api/records/{id}` the id is the path segment as written, without percent-decoding: any segment that is not a stored id, `%32%32` included, answers 404. The response holds:

- `html`: for `list`, the list of that page rendered with `layout: table`, the page and the
  stored total; for `detail`, the detail of the record; for `form`,
  `<form id="record-form" method="post" action="/api/{server}/records/{id}" enctype="multipart/form-data">`,
  the form rendered from the record with key prefix `form`, and `</form>`. Every list link is
  `/detail?id={id}&` and every detail link `/form?id={id}&`, followed by the selection query
  `lang`, `server`, `framework`, `initialization`, `mode`, `page` in that order. The HTML is
  byte-identical across servers;
- `data`: `{ page, perPage, total, records }` for `list` and `{ record }` for `detail` and
  `form`.

`src/record-contract.mjs` computes the expected value of every response above with the shared
JavaScript renderers and validator. The other servers use their own generators and validators
and must produce the same bytes and results.

**Record servers.** Every record server takes its listening address, its data directory, its
public directory and the source identity file: the Go and Rust binaries and
`servers/javascript/main.mjs` as arguments in that order, PHP as `-S {address}` with the
environment variables `FORM_DATA_DIRECTORY` and `FORM_PUBLIC_DIRECTORY`. The public server
takes its address, its data directory, its public directory and the JSON map of the native
server ports as arguments; it answers the `js` records with the same module that
`servers/javascript/main.mjs` serves, and it receives the build state over IPC. Each server
prints its readiness line after it listens on the requested address.

## Canonical page

The page has three addresses: `/` (list), `/detail` and `/form`. The query holds `lang`,
`server`, `framework`, `initialization`, `mode` and `page`; `detail` and `form` also take `id`,
and the list takes `saved` after a save. A missing selection member takes its default (`ko`,
`js`, `html`, `csr`, `bindForm`, `1`); an unknown value answers 400, and a page beyond the last
page or an unknown id answers 404; both failures are JSON `{ "error": message }`. Every link the page or CRUDUI generates carries the whole
selection in the order above, so the page and the selection survive every step. The selection
controls `#server`, `#framework`, `#initialization` and `#mode` and the pagination navigate with
the changed member.

The document has one stage, `<section id="stage" data-view="{view}" …>`:

- **SSR**: the public server requests the view from the selected server
  (`/api/records/view/…`), writes its `html` into the stage and its `data` as
  `<script type="application/json" id="crudui-stage-data">` with `<`, `>` and `&` written as
  JSON escapes. The selected client takes over that markup with the same data, under each
  adapter's hydration rule below. The stage is in the initial HTML, as view-source shows it.
- **CSR**: the stage is empty and the document has no stage data. The selected client requests
  the JSON of the selected server (`/api/{server}/records?page=…` or
  `/api/{server}/records/{id}`) and renders the view in the browser: `html` with
  generator-html's list, detail and form renderers, `react`, `vue` and `svelte` with their
  `List`, `Detail` and `Form` components. No server HTML is inserted.

The form is rendered in the stage in the selected mode: `bindForm` with its application
controller, `createForm` with a form session. A submit event of `#record-form`, from its Save
button or from Enter in a field, sends the form's native fields as `multipart/form-data` to
`/api/{server}/records/{id}`. On 200 the page navigates to `/?{selection}&saved={id}` with the
same page; on 422 it shows the validation result in the form and stays. The list with `saved`
shows `<p id="saved-notice" role="status" data-record-id="{id}">` with the saved notice in the
page language; under SSR the notice is in the initial HTML.

When a view is interactive, the page posts
`{ type: 'crudui:pipeline-ready', view, server, framework, initialization, mode, page, id }`
to its own window, with `page` a number and `id` null on the list. A view that cannot
initialize fails with a script error. Checks wait for this event and never infer readiness from
the DOM.

## Canonical flow check

`src/pipeline-flow.mjs` checks this page for 40 combinations: five servers, four clients and
two initializations. The form mode alternates so that every server and every client runs both
modes, and the submission alternates between the Save button and Enter. Each combination edits
its own record on page 2 of its server's store (ids 21 to 28) and:

1. requests the list, detail and form documents and requires the rendered stage and the stage
   data in SSR documents, and an empty stage without stage data in CSR documents;
2. opens the list at page 2, follows the record's detail link and then its form link, and
   requires each address and each readiness event;
3. requires the read-only id, replaces the score, submits, and requires the list address with
   the same page and `saved`, the visible saved notice of the record and the new score in the
   record's row as the shared list model formats it;
4. requires the selected server to have stored the score, and under SSR requires the notice and
   the score in the initial HTML of the list.

Each combination is one unit with its own timeout, in its own browser context; four run at a
time. A unit prints its start with its limit, its elapsed time every 15 seconds and its result
with its duration. A unit that reaches its limit fails with its id and closes its browser
context. The limit of one combination is ten times the slowest combination measured on the
first run of the implemented flow; until that measurement it is 60 seconds. Before the
combinations run, each server's store is reset through the public API, one unit per server.

The same combinations run against a local stack built from the checkout
(`pipeline.browser.mjs`, one test per combination) and, in tree verification, against the
deployed service (`check-pipeline.mjs`). `record-stores.test.mjs` runs the HTTP contract cases
of `src/record-contract.mjs` against all five servers started from the checkout, each case with
its own timeout. Both local checks first build the server programs, each as a step with its own
limit: the OrderedJSON checkout at `.form-comparison/sources/ordered-json` (the path the Go and
Rust manifests name), both PHP extensions, the PHP validator copy, the Go binary and the Rust
debug binary. The local stack then starts its five processes at the same time, each with the
process start limit, and its browser with the measured browser start limit. The test hook that
runs these operations has no limit of its own, because each operation holds one and prints its
progress. `npm run test:form-comparison:pipeline` runs both, and the CI job
`form-comparison-pipeline` runs that command.

## Progress, limits and scope

Three rules hold for every command in this contract: the deployment, the
supervisor's build cycles and every verification check.

1. **A run reports what it is doing while it runs.** No check waits with only a
   start and an end. Every step prints a start line with its own limit, a line
   with its elapsed time every 15 seconds while it runs, its output under its
   step name, and a line that says passed, failed, timed out or stalled with the
   duration. Nested units report the same way, as progress lines of the form
   `[label] unit: started|running|passed|failed|timed out`: each build target,
   each browser report, each check phase, the browser start and close, each
   canonical flow combination and every wait, including the wait for a build cycle.
2. **Every unit holds its own limit, sized from its measured duration, and no run
   has a total limit.** A unit's limit is three times its slowest measured
   duration, rounded up to five seconds and at least ten seconds
   (`measuredLimitMs`), and the code names the measurement it comes from. A step
   that is a single operation, such as a build target, the generation check or the
   browser aggregate, holds a total limit sized the same way. A step made of units,
   such as a browser check, the canonical flow check or the host's tree
   verification, holds no total limit and no duration budget, and no limit is
   summed from its units: it holds an inactivity limit of 45 seconds, three missed
   15-second heartbeats, and fails as stalled when it prints no progress line for
   that long. Output that is not a progress line, and the runner's own heartbeat,
   do not count as progress. A step that reaches its limit or its inactivity limit
   is stopped with its whole process tree, its process group and every descendant
   that left the group, and the run fails with that step's id and elapsed time. A
   stopped check closes its browser on `SIGTERM` instead of waiting for `SIGKILL`.
3. **A check runs where it belongs.** Tree verification covers the deployed
   services alone. The host and CI run the source suite, the Go and Rust server
   tests and the ordered JSON tests; repeating them inside the container would
   verify no build output of that container. During development only the tests of
   the changed code run, and the complete verification runs once at the end.

## Source and environment

The comparison runs one long-running toolchain container. The repository is
mounted read-only at `/workspace/source`, and the image contains no repository
source. A source change, committed or not, applies to the running service without
building the image again.

### Toolchain image

`examples/form-comparison/Containerfile` defines one image: Node.js 26, Git, PHP
8.4 (CLI, development headers, mbstring and XML), Composer, the C build tools, Go
1.27, stable Rust, tini, and the pinned Chromium with its sandbox. No instruction
copies or reads the repository, and no build step depends on it. The image tag is
the first 16 hexadecimal characters of the SHA-256 digest of the Containerfile
content, so the image is built again only when that file changes. The container
starts as root only to give the two volume roots to the unprivileged `node` user.
It then runs the supervisor as that user.

tini is process 1. Builds, the Git comparison and browser checks leave orphans the
supervisor never started: esbuild, Git, Chromium and its crash handler. Process 1
adopts them, and a process 1 that does not reap them keeps every one as a zombie
for the life of the container. The command is one command, so tini is process 1
however the runtime combines an entrypoint and a command.

### Build volumes

Build outputs never enter the host tree, because host (macOS) and container
(Linux) binaries differ. The container owns two named volumes:

- `/workspace/build` holds the build tree, the npm dependencies and package builds,
  the Composer installations, the PHP extension builds, the Cargo target, the Go
  and Rust server binaries and the public directory with the built frame pages;
- `/workspace/cache` holds the npm, Composer, Go and Cargo caches.

`/data` keeps the saved records and `/results` the verification reports. Both are
directories of the deployment.

The build tree `/workspace/build/tree` holds the files Git shows in the mounted
repository: tracked files and untracked files that are not ignored, except the
operator-local `.claude/settings.local.json`. It exists
because npm, the PHP extension builder and the Cargo and Go path dependencies write
next to their sources. The read-only mount rejects those writes, and the container
runtime cannot create a volume mountpoint inside a read-only mount that lacks the
directory. Ignored files, including the host's `node_modules`, `vendor` and build
outputs, are never copied. A manifest records the copied paths. A path removed from
the repository is removed from the build tree; build outputs, which the manifest
never lists, remain. The supervisor recreates that exact checkout directory to remove stale
contents, then checks out one pinned `polyspec/ordered-json` monorepo revision
into `.form-comparison/sources/ordered-json` inside the build tree. The five implementation
package directories (`go/`, `js/`, `php/`,
`php-extension/` and `rust/`) must exist at that revision; they are not separate
repositories or submodules.

### Natural application

One supervisor, `examples/form-comparison/supervisor.mjs`, runs in the container.
At start it synchronizes the build tree, builds every target and starts the public
server (which is also the JavaScript record server) and the four native API servers
(PHP, the PHP extension, Go and Rust). File events from the macOS host do not reach the
Linux container through the VM file share. The supervisor therefore compares the
mounted repository with Git once per second: the checked-out commit and the size
and modification time of every uncommitted path. It copies only the changed paths,
runs only the targets whose inputs changed, in the order below, and restarts only
their processes. A target also runs when a target it depends on runs.

| Target | Inputs | Depends on | Restarts |
| --- | --- | --- | --- |
| `npm-dependencies` | root `package.json`, `package-lock.json`, package manifests | | public |
| `javascript-packages` | the TypeScript validator and generator packages, root `tsconfig` files | `npm-dependencies` | |
| `ordered-json-javascript` | the pinned checkout's `js/` package copied to `node_modules/ordered-json` | `npm-dependencies` | |
| `frames` | the example `build.mjs`, `public/`, `src/`, `viewer/` and `fixtures/`, the TypeScript packages, the form snapshot module | `npm-dependencies`, `ordered-json-javascript` | |
| `browser-matrix` | `src/runtime-paths.json` | | public, Go, Rust |
| `public-server` | `server.mjs`, `servers/javascript/`, `src/json.mjs`, `src/record-contract.mjs`, `src/runtime-paths.mjs` | | public |
| `composer` | `packages/validator-php/`, the generator Composer manifest and lock | | |
| `crudui-php-extension` | `packages/php-ext/`, the CRUDUI and shared extension build scripts | | PHP extension |
| `ordered-json-php-extension` | the OrderedJSON and shared extension build scripts | | PHP extension |
| `go-server` | `servers/go/`, the Go generator and validator | | Go |
| `rust-server` | `servers/rust/` except `target/`, the Rust generator and validator | | Rust |

Each target declares its own timeout and reports its start, its elapsed time while
it runs and its duration when it finishes; a target that reaches its timeout fails
the cycle with its process tree stopped. The Git calls of the source comparison and
of the pinned OrderedJSON checkout are bounded the same way. Each server's output
carries that server's name. The PHP built-in server writes an `Accepted` and a
`Closing` line per request, which bury every other message; those two lines are
dropped and every other line, warnings included, is kept.

PHP reads its sources on every request, so a PHP source change needs no build or
restart; only the installed Composer copies are replaced. `composer install` keeps the
validator's path-repository copy while the lock is unchanged, so the build reinstalls that copy
(`composer reinstall crudui/validator`). A `.gitignore` change
synchronizes the whole tree. A change to a supervisor module reloads that process in
the existing container and preserves all volumes. The supervisor is the only child of the
container's init process, so it stops its servers and replaces its own process image with the
new supervisor (`process.execve`), keeping its process id; exiting would stop the container.

### Source identity

The source identity of a tree is its checked-out commit and the SHA-256 digest of
its uncommitted changes. The digest covers every path `git status` reports,
including untracked files other than `.claude/settings.local.json`, in sorted order: the path and the digest of its content,
or its deletion. A tree without uncommitted changes has `changes: null`. Identity
comparison ignores inode, device and change times, which differ between the host
and the container view of the same files.

After a build cycle the supervisor writes the identity to `source.json` in the
public directory. The PHP, Go and Rust servers read that file on every health,
generation and SSR response. The main page and the frames fetch it when they load.
No build embeds a commit.

### Build cycles

A build cycle is `building`, `ready` or `failed`. After it
rebuilds and restarts, the supervisor sends one health request to each API server.
It requires the published identity and, for the PHP extension, the digest of the
`crudui.so` it built and loaded. The public server receives each state from the
supervisor as a process message. `/api/health` returns `{"status": "ok",
"servers": [...]}` only for a ready cycle. At every change the supervisor also
replaces the build state file `state/build-state.json` with the cycle number, status, identity,
error and `progress`. While a cycle builds, `progress` names the current startup step, target or
restart and the time it was renewed; the supervisor renews it at each of them and every 15
seconds, and each target holds its own limit. A failed
build keeps the previous processes running and reports `failed` with the error. It
does not select another build.

Each child server publishes one readiness event after binding its listening
socket. The supervisor waits for that event before it requests health. Startup and
verification use no sleep interval, retry loop or periodic health request; the
only intervals are the source comparison above and the progress lines of a running
step, which report elapsed time and never decide that something is ready.

The supervisor uses one PHP extension builder for `crudui.so` and
`ordered_json.so`. Each extension has an explicit build entry point and declares
its sources, module name, output directory and load check. The builder reads the
PHP executable, headers and build flags from one `php-config` executable and
compiles both modules directly without `phpize`, Autoconf or libtool. It resolves
each required executable once before compilation. Relative paths, symbolic links,
missing tools, multiple discovery results and PHP installation mismatches fail
the build. A failed command does not select another executable or build path.
Generated build and module paths contain only regular files and directories.
The Linux toolchain declares its versioned `php-config` file and selects the C
compiler from one installed Debian `gcc` package record.

The host commands resolve the container executable from one installed package
record. The record identifies one versioned installation directory and one regular
executable file. Relative paths, symbolic links, missing records, multiple
matching records and alternate command providers are rejected. Runtime resolution
does not try another path after an invalid result.

The form-comparison CI job installs the root npm graph and the Composer graphs
for the PHP validator and generator before it runs the source and generator
construction suites. A clean checkout does not use an ignored `vendor/` directory.

Browser verification registers the host callback for main-page readiness before
navigating. The main page publishes readiness after both initial comparison
frames publish their readiness events. The verifier waits for the host callback
without keeping a browser evaluation call open. Every module copied directly to
the public directory uses only browser-resolvable imports. Source verification serves
those modules over HTTP and loads them in Chromium with their imports. A frame that
cannot initialize publishes the reason instead of a readiness event, and the page
fails with that reason. A script error, page failure or page close before
main-page readiness rejects the current server run and records the failure. The
readiness wait does not remain pending after an observed initialization failure.
The verifier also subscribes to the exact job and renderer events before it starts
the corresponding operation. It awaits the operation promise and the renderer
completion signal before reading the result. It does not infer page readiness,
frame readiness, validation completion or rendering completion from periodic DOM
reads or elapsed time. A time limit may fail a browser operation that stops
publishing progress, but reaching that limit cannot produce a successful result.

## Implementations and requests

This section and the next three describe the benchmark console's form matrix; the
canonical page uses the record resource above. PHP, the PHP extension, Go and Rust
implement the same compile, render, validation, persistence and SSR request contract. Each server uses its own
generator and validator. The PHP extension process loads `crudui.so` and
`ordered_json.so`; the PHP process loads neither extension. The supervisor rejects
an unexpected class source, module digest or source identity.
The PHP process reads the validator installation directory from
`packages/generator-php/vendor/composer/installed.php` in the build tree.
This file is the authoritative installed-package record for the selected
generator autoloader. Records registered by other Composer installations do not
affect package selection. The record file, installation directory and validator
class must use regular paths without symbolic links. The validator class must
match the corresponding source file in the build tree. The process
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

The frame page's form has `novalidate`: the frame validates with the CRUDUI validator and shows
that result, and its checks send invalid submissions to the servers on purpose. The canonical
page's form keeps the browser's constraint validation.

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
the same packages from the same source tree, the same keyed data and the same
submission contract. The selected server compiles one data-independent template,
and the browser restores that template from JSON. The `bindForm` path evaluates
field models from the template and current data; its application controller
updates keyed data and binds the fields again after input and row operations. The
`createForm` path creates an editable form session from the same template and uses
the session for data replacement and row operations. Compile failures are returned
as failures; the browser does not compile a replacement template.

The comparison screen of `/benchmark-console/` selects a server, framework and rendering path and shows server-side
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
(Svelte). It covers what the view containers hold, not the framework-owned container attributes.
The frame compares the contents of each view container and leaves framework markers such as Vue's
CSR `data-v-app` untouched. That a column really hydrated is enforced by the frame's node check
below, not by this comparison.
Each adapter declares what hydration does with the server-rendered nodes:
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

Every render comparison includes the framework-independent HTML renderer in addition to React,
Vue and Svelte. A parity verdict therefore covers four renderers.

The canonical list uses semantic column alignment: identifier, numeric and monetary values are
right-aligned; status is centered; dates are centered; text and HTML values are left-aligned; image
cells are centered on both axes. Table cells are vertically centered. The list includes the record
identifier as an explicit sequence column. Monetary output does not add trailing zeroes that are not
present in the source value.

The canonical list contains the 45 stored records and uses offset pagination with 20 records per
page, so it exposes three pages containing 20, 20 and 5 records. The selected page is part of every
page address and every generated link, and the selected server or client renders the list of that
page with the stored total; no renderer replaces `total` with the number of rows in the current
page.

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

Each unit of a server run holds its own limit from its slowest measured duration
(`measuredLimitMs`), and no limit covers the run as a whole. The measurements come
from the deployed verification of 2026-09-16, with the four browser checks running
at the same time. An initialization report, measured at 32.4 seconds at most, gets
100,000 milliseconds; a scenario report, measured at 2.2 seconds, gets 10,000; the
page work before, between and after reports, measured at 1.9 seconds, gets 10,000
(`browserReportMeasurementsMs` in `src/browser-job.mjs`). The units around the
report job hold their own limits as well (`browserUnitMeasurementsMs` in
`browser-report-policy.mjs`): the browser start (0.7 seconds) and close (0.1
seconds) and the main page (1.8 seconds) get 10,000 milliseconds each; the
interaction checks, the frame-document checks and the artifacts took 26.3 seconds
together, and until each is measured on its own each gets 80,000. A server report
records the status, duration and limit of these units under `units`. While a unit
runs, the check prints its progress line with its elapsed time every 15 seconds,
and it prints each completed report with its result and duration. A unit that
reaches its limit fails the run with that unit's name and its elapsed time, and the
failure retains the current state and every completed report. The browser check as
a whole has no limit, no summed limit and no duration budget; tree verification
stops it only when it prints no progress line for 45 seconds.

A complete server report requires a browser job of 24 reports: 16 scenario
reports with 19 checks each and eight initialization reports with 168 comparison
results each. It also requires 80 interaction checks, eight mount-before-load checks
of the `csr` frame, 16 frame-document checks, no browser or page errors, one
and one source identity shared by the report and every scenario and initialization
report. The report records its duration; the duration is not a pass condition.
Fields named `passed` must be booleans. Missing activity,
initialization stages or timing evidence makes the report incomplete.

The four-server aggregate requires one complete report from every server. It
requires 1,216 successful scenario checks, 5,376 successful initialization
comparisons, 320 successful interaction checks, 32
successful mount checks, 64 successful frame-document checks, equal frame pages behind
every server's documents. Any failed,
missing, malformed or unequal result sets `passed: false` and returns status 1.
Only a complete aggregate with zero failures returns status 0.

## Additional verification

Generation verification requires 450 successful results, 899 HTTP requests and
all 32 server/rendering-path/framework combinations. Repository verification
checks atomic updates, locking, position-based loading, parent ownership,
rejection without file changes, complete deletion and sequence allocation. Type
verification checks the same scalar and collection rules in every server.

Two PHP warnings belong to these checks and are not defects. The persistence
check's `request-size-limit` sends a field above the 2 MiB request limit in all
three transports and requires status 413, which logs `POST Content-Length ...
exceeds the limit`. The browser `shape` check sends a native form with 10,001
fields, above `max_input_vars`, and requires status 400, which logs `Input
variables exceeded 10000`. Each warning comes from the request its own check
asserts on.

Fast source tests reproduce report-policy failures, protocol timeout behavior,
each report's own limit and the progress it reports, the step runner's timeout,
inactivity limit and process-tree stop, the dropped PHP access lines, source identity and build-target selection,
build tree synchronization, snapshot differences, generation cache behavior and
request-count changes, the unit runner's limits and progress, the record resource's
fixture and links, and the canonical page's declared controls. These tests do not
replace tree verification. Pull request and `main` push CI runs
`npm run test:form-comparison` so report-policy, browser-job, source-tree and
generation-performance regressions block integration, and
`npm run test:form-comparison:pipeline` so the record-store contract of all five
servers, the Go and Rust server tests and the canonical flow check of all 40
combinations block integration.

## Tree verification

Verification runs inside the running comparison container as the `node` user,
with the Chromium sandbox enabled, against the build of the current tree. It waits
for the current build cycle by reading the build state file every second and requires it to be
ready; a failed cycle fails the wait. The wait (`build-readiness`) has no total limit: it stops as
`stalled` when the file shows no new progress for 45 seconds, which also bounds a missing file or
a stopped supervisor, and it prints its progress line with its elapsed time and the current state
every 15 seconds. The public server needs the built packages, so it cannot report a cold build;
the file comes from the supervisor, which runs from the start. It clears `/results`, records the identity in
`results/source.json` and runs these stages in order, stopping at the first stage
with a failed step:

1. the PHP processor modes, which load the `crudui.so` and `ordered_json.so` this
   container built (60,000 milliseconds; measured at 1 second);
2. generation against the four running native servers (120,000; measured at 7 seconds);
3. persistence against the four running native servers (60,000; measured at 2 seconds);
4. the canonical flow check of the deployed page for all 40 combinations
   (`check-pipeline.mjs`; units with their own limits, the step with the inactivity
   limit alone);
5. browser verification for PHP, the PHP extension, Go and Rust, the four at the
   same time (units with their own limits, each step with the inactivity limit
   alone; one run measured at 316 seconds);
6. the browser aggregate of this run's four reports (120,000).

Each step verifies the deployed build: an extension this container compiled, a
running server or a built frame page. The source suite, the Go and Rust server
tests and the ordered JSON tests read no build output of this container, so the
host and CI own them and verification does not repeat them.

The four browser checks run at the same time because each one drives its own
browser process, with its own focus, selection and scroll, against its own server
and its own stored records; nothing one check measures reaches another. They need
the processors for it: one check occupies about one processor, so the deployment
gives the container eight.

It then requires the same build cycle and identity. A source change during
verification fails the run. Every report records the identity. The evidence check
requires the generation report, persistence report, canonical flow report
(`pipeline.json`: 40 passed combinations and five passed store resets) and browser
aggregate to name that identity and to satisfy every count and pass condition in
this contract. The
host command requires the evidence identity to equal the checkout's identity both
before and after the run. Evidence contains no image digest or archive hash.
Verification uses the deployment's `/data`, as any automated run against the
deployment does, so checks from other browsers must not run at the same time.

## Deployment

The local comparison service at `crudui.test` is the long-running toolchain
container. The deployment command builds the toolchain image only when no image
has the tag of the current Containerfile content. It writes
`.form-comparison/deployment/compose.yaml` with:

- that image;
- the repository root mounted read-only at `/workspace/source`;
- the named volumes `crudui-comparison-build` at `/workspace/build` and
  `crudui-comparison-cache` at `/workspace/cache`;
- the deployment `data` directory at `/data` and `results` directory at `/results`;
- the `containerctl.domain: crudui.test` label.

The definition gives the service eight processors and 8 GB, which the four
simultaneous browser checks need. It contains no commit, archive or image digest,
so a source change never changes it.

The health check accepts the service only when `/api/health` reports every server.
containerctl accepts each health duration up to 10 minutes and 1 through 100
retries, and waits at most the start period plus the retries times the interval and
timeout, 30 minutes in total. The definition does not take that budget: the first
start of empty volumes installed and built everything and answered health 58
seconds after the container started, so the check waits a 120 second start period
and then 24 checks every 5 seconds with a 5 second timeout, six minutes in all.

While containerctl waits, the wait is not silent. containerctl reports the started
container and each health attempt with its elapsed time, and from the start of the
container the deployment command prints the supervisor's build progress: each build
target's start, its elapsed time while it runs and its duration. Applying the
definition holds its own timeout, the health budget and one minute for containerctl
itself; building the image holds its own.

Before it applies the definition, the command preserves the saved records of the
active service in `.form-comparison/deployment/data` without overwriting different
files. After applying the definition with containerctl, it uses the explicit
containerctl CA to request the HTTPS home page, health response, `source.json` and
one saved-data response. It verifies the route, certificate, image, mounts, stored
files, that the container cannot write the mounted repository and that the served
identity equals the checkout's identity. If the reuse condition passes, it does not
apply the definition again and retains the container identity, creation and start
times, image, mounts, route, certificate, identity, stored files and response bytes.
Any change or failed request makes deployment verification fail. `/data` and the
build volumes remain across applications.

After deployment verification succeeds, the command removes comparison images that
no container uses, including per-commit images of the removed archive procedure,
and the retired `.form-comparison/candidates` and `.form-comparison/results`
directories. `.form-comparison/sources` holds the host's OrderedJSON checkout that the
local record-store and canonical flow checks build from, and it remains. It records the image, Compose digest, data
preservation and both snapshots in `.form-comparison/deployment/verification.json`.
## Deployment lifecycle invariant

A running container with the expected image and exact source, build, cache, data and results
mounts is reused. Source synchronization must not call `containerctl down`, recreate the container,
restart the service, or reconnect volumes. `containerctl up` is a bootstrap operation for an absent
or incompatible container only. The canonical page takes every SSR stage from the selected server
and every record from that server's store; the public server renders a stage only when `js` is
selected.
