# Changes

[한국어](CHANGELOG.ko.md).

## 2026-09-14 — Record the CSS-only sticky candidate run and its deployment

`node examples/form-comparison/candidate-verification.mjs` passed for 3578158. PHP,
the PHP extension, Go and Rust each passed 1,452 checks with no failure, and the
browser verification recorded 5,808 checks with no failure. Earlier runs had stopped:
338d060 failed in the React SSR takeover of sticky rows and 5fbcf5a on a Chromium
screenshot error, both fixed or superseded by later commits, and the first run of
3578158 failed while building the image because the disk was full. The container
image builder held about 75 GB of build cache from the repeated candidate builds;
`container prune`, `container image prune --all` and deleting the builder (which
rebuilds its cache on the next build) left 83 GiB free, and the running containers
and volumes were not touched. `node examples/form-comparison/comparison-deployment.mjs
--commit 3578158…` deployed it at `https://crudui.test/` and passed the identical
reapplication. In a browser the SSR and CSR columns match 8/8, each frame has four
sticky rows and no `data-crudui-stuck`, `data-crudui-current` or published lengths,
and after scrolling the SSR frame the company header sits on its line with its label
shown while the not yet stuck Busan header hides its label.

## 2026-09-14 — Make sticky rows CSS only and remove scroll measuring

Sticky rows did not behave the same in a frame as in a page because the browser
binding measured the scroll position in script: `connectRows` decided which rows were
stuck and current from bounding rectangles, published lengths for a computed space
after the form, and `alignRow` scrolled rows with `scrollIntoView`, which also scrolls
every enclosing document. Each fix to one of those calculations (the scroll container,
the content after the form) exposed another place where the reference was wrong. The
user decided to keep only what CSS can do.

- Removed: `connectRows`, `RowTracking`, `markOutline`, `alignRow`, the
  `data-crudui-stuck` and `data-crudui-current` attributes, the `crudui-current` event,
  the structure map's `aria-current` marking, the published
  `--crudui-scroll-height` and `--crudui-form-end-*` lengths, the space after the form,
  the current row border and the rule that showed `controls: outline` on the current
  map line only (map lines now always show their controls). The jsdom stand-in for
  `scrollIntoView` and the takeover comparisons' exclusions for those attributes are
  gone with them, and `contracts/features.json` no longer lists the three functions.
- `crudui.css`: sticky headers still stack on `--crudui-sticky-depth` lines; the level
  label shows only while its header is stuck, through a `scroll-state(stuck: top)`
  container query; controls in a sticky row keep a top scroll margin of the headers
  pinned above them (`--crudui-sticky-cover`) and every form control a bottom scroll
  margin of the footer.
- Moving to a row after a row operation or a structure map selection focuses its
  control, and the browser scrolls it into view (Chromium centres it); the same code
  runs in `connectForm`, `connectOutline` and the comparison `bindForm` controller.
- The Chromium style checks run every case in a page, in a scrolling box and in a
  frame: stacked headers on their lines with labels only while stuck, and focus after
  adding a row and after a map selection clear of the pinned headers and the footer.

`make format-check`, `npm run test:forms` (core 108, HTML 116, React 350, Vue 341,
Svelte 338 and 10 client tests), `npm run test:form-comparison:source` (140),
`npm run test:build`, `npm run test:dependencies`, `make docs-check` and the Chromium
style checks (6: two in each host) passed. The last `make docs-check` run first failed
because the disk was full while rebuilding the Rust crates; after removing the stopped
5fbcf5a candidate container, image and directory it passed.

## 2026-09-14 — Take over sticky rows identically in React

The candidate run of 338d060 failed in `browser-php`: the SSR takeover in React
differed on the first sticky row, whose style the server writes as
`--crudui-sticky-depth:0` and React as `--crudui-sticky-depth: 0;`. The local shared
takeover test had not caught it because its specification had no sticky rows; I had
declared sticky rows only in the comparison example.

- A `style` attribute is a CSS declaration block, so the takeover comparison, in the
  comparison frame and in `compareServerTakeover`, compares it as the CSS object model
  serializes its declarations.
- The shared form session specification declares sticky rows for companies and stores,
  so the React, Vue and Svelte form tests render and compare them.
- That exposed a React fault present since f7f814e: `resolvedStyleProps` removed and
  re-added the style attribute each time React called its ref, on every render, so a
  re-rendered row's style moved after the `data-crudui-current` attribute the browser
  binding had written, and a form given its data later differed in raw HTML from one
  created with it. The style attribute is now placed after the rendered attributes
  only when an element first connects, and later declarations replace it in place.

`make format-check`, `npm run test:forms` (core 108, HTML 116, React 350, Vue 341,
Svelte 338 and 10 client tests), `npm run test:form-comparison:source`,
`npm run test:build`, `npm run test:dependencies`, `make docs-check` and the Chromium
style checks (5) passed.

## 2026-09-14 — Count the content after the form in the trailing space

The trailing space after the form ignored the content that already follows the form in
its scroll container. In the comparison frame, where the results follow the form, it
added 1,037 px (the 1,448 px frame less the 362 px end-row extent and the 49 px footer),
leaving a blank area between the form and the results, and the end row scrolled past
its line by the height of that content. The rule now subtracts the content after the
form, apart from the form's own margin, measured by `connectRows` and published as
`--crudui-form-end-after`, and never goes below zero. Scrolling stops with the end row
on its line when the content after the form is shorter than the space it needs, and
longer content scrolls into view with no space added. The documentation no longer
describes the limit as exact only when nothing follows the form.

Two Chromium checks cover it: 60 px of content after a form in a scrolling box, where
the end row stopped 60 px past its line before the change (27 px against 87 px), and
600 px of content, where no space is added and the content scrolls to its end.

## 2026-09-14 — Apply the sticky rules in any scroll container and declare sticky rows in the comparison example

The comparison page showed no sticky headers because its example specification did
not declare `multiple.header: sticky`; the local preview declared it, so the same
generator behaved differently between the two examples. Checking why exposed a fault
that would appear wherever a form sits in a scrolling box, a dialog or a frame rather
than the page: `crudui.css` computed the trailing space after the form from `100vh`,
the page viewport, while the sticky headers follow their scroll container, and
`connectRows` treated an ancestor as the scroll container only while its content
already overflowed, unlike `position: sticky`. In a 420 px scrolling box inside a
700 px page, scrolling went on until the end row was 193 px above the box instead of
stopping with it on its 87 px line.

- `connectRows` resolves the scroll container as `position: sticky` does (the nearest
  ancestor whose vertical overflow is `auto` or `scroll`, otherwise the document) and
  publishes its height as `--crudui-scroll-height` with the two end-row lengths;
  `crudui.css` uses it in place of `100vh`. The SSR takeover comparisons leave it out
  with the other binding state. A DOM without `scrollingElement`, such as jsdom, uses
  its root element as the document scroller, and the comparison controller test's
  stand-in document has a root element like a real one.
- The comparison example declares `header: sticky` and `title: name` for companies,
  stores and departments, so every server and framework renders and compares sticky
  rows.
- A Chromium check mounts a form in a scrolling box and verifies stuck headers on
  their lines, no scroll pull-back, the end row stopping on its line and being current,
  and the published height. Before the change it failed with the end row at −193 px
  against its 87 px line.

## 2026-09-13 — Record the passing SSR/CSR candidate run and its deployment

`node examples/form-comparison/candidate-verification.mjs` passed for 8d0d467. PHP,
the PHP extension, Go and Rust each passed 1,452 checks with no failure, including
192 initialization comparisons per server, rendering path and framework with the SSR
takeover. The browser verification recorded 5,808 checks with no failure. The first
run of 8d0d467 stopped during image construction because the disk was full; the Go
build cache and temporary check directories were removed and the same commit was run
again. `node examples/form-comparison/comparison-deployment.mjs --commit 8d0d467…`
deployed it at `https://crudui.test/` and passed the identical reapplication. In a
browser the page shows the SSR and CSR columns (side by side above 1,000 px wide)
with 8/8 comparisons matching for PHP, React and bindForm.

## 2026-09-13 — Use the SSR and CSR column names in the browser interaction checks

The candidate run of 4607254 failed in `browser-php` before any interaction ran: the
interaction check still looked for the frame with `initialization=data`, and the initial
mount check still looked for `initialization=inject`, the column names 880cb11 replaced.
The interaction check now uses the `ssr` frame, the initial mount check the `csr` frame,
and the report test fixture the `ssr` column. These checks run only inside the candidate
container, so the local source checks (140 passed) did not reveal the old names.

## 2026-09-13 — Restore the React form session tests removed with the legacy UI

d26ecce deleted `packages/generator-react/src/__tests__/Form.test.tsx` together with
the legacy FormBuilder test in the same file, so React stopped running the shared
initialization, session DOM, control and focus scenarios that Vue and Svelte run. The
file is restored without the legacy test and also runs `compareServerTakeover`.
React passes 350 tests.

## 2026-09-13 — Make Vue and Svelte take over server-rendered forms without changing them

The first candidate run of d80a3a0 failed in the SSR column. Vue keeps comment nodes as
anchors for conditional blocks, and Svelte 5 kept the whitespace between sibling
elements of its templates as text nodes, left empty text anchors, and did not write the
`value` attribute of inputs, the text of textareas or the `checked` attribute of
checkboxes into the browser DOM. Comments and empty text render nothing, so the takeover
comparison leaves them out in the comparison frame and in a new shared test,
`compareServerTakeover`, which the Vue and Svelte form tests run against the HTML
renderer's output for the same session. The Svelte templates are written without
whitespace between sibling nodes, and inputs, textareas and checkboxes set both the
server attribute or text and `defaultValue`/`defaultChecked`, so Svelte's server output
and its browser DOM equal the other renderers'.

`make format-check`, `npm run test:forms` (core 108, HTML 116, Vue 341, Svelte 338 and
10 client tests), `npm run test:form-comparison:source`,
`npm run test:build`, `npm run test:dependencies`, `make docs-check` and `svelte-check`
passed. The candidate verification is recorded in a separate entry.

## 2026-09-13 — Compare server-side and client-side rendering on the comparison page

The comparison page showed two client-side columns, "create with data" and "mount,
then inject data", so it never showed that the server languages and the browser
frameworks render the same form. The columns are now SSR and CSR. In the SSR column
(`initialization=ssr`) the selected server (PHP, the PHP extension, Go or Rust)
renders the form with the saved record, the frame places that HTML in the page, and
the selected framework takes the form over with the same template and data; the
takeover must leave the parsed form DOM (every element, attribute value, text and
comment) unchanged, apart from the state the browser binding writes
(`data-crudui-stuck`, `data-crudui-current` and the end-row lengths). The first
candidate run compared serialized HTML and failed only on attribute order: React sets
an input's `type`, `value` and `name` after its other attributes. Attribute order is
not part of the DOM, and the string renderers' byte-identical HTML stays covered by the
generation checks, so the takeover compares the parsed DOM.
The CSR column (`initialization=csr`) mounts the form without data and injects the
record. Every stage is then compared between the columns as before. The comparison
labels, the SSR document links, the frame readiness and typing checks and the
documentation use the new names.

The form comparison source checks passed 140, the Go and Rust comparison server tests
passed, and `make docs-check` passed. The SSR takeover itself runs only in the
four-server candidate verification, recorded in a separate entry.

## 2026-09-13 — Record the passing four-server candidate runs for crudui.css and the legacy removal

`node examples/form-comparison/candidate-verification.mjs` passed for 0ab3c93 (form
styling with `crudui.css` alone) and for eb9f7b7 (after removing the legacy UI paths
and fixing the build and dependency checks). In each run PHP, the PHP extension, Go
and Rust passed 1,452 checks with no failure, the browser verification recorded
5,808 checks with no failure, and the command returned status 0.

## 2026-09-13 — Fix the build and dependency checks that CI runs

`npm run test:build` and `npm run test:dependencies` were failing, and the form
suites used during this work did not run them:

- `tests/build/public-types.mts` and `public-types.cts` still named `FieldShape` and
  `MultipleSettings`, which the node view model removed. They now name the current
  public types `NodeVM` and `ButtonVM`.
- The form comparison controller imports `@crudui/generator-core` (since 7a2b73a),
  but the root package did not declare it. The root package now declares the
  workspace package as a development dependency.
- `tests/build/package-consumer-pack.test.mjs` passed paths that do not exist, while
  `packPackage` reads the source manifest to check the package name (since 07e8f9f).
  The tests now write a manifest in a temporary directory.

`npm run test:build`, `npm run test:dependencies` and `npm run test:runtimes` passed,
as did every `tests/build` and `tests/docs` test (67).

## 2026-09-13 — Remove the Bootstrap-based legacy UI paths

The legacy form components and the original Legacy rendering comparisons were
built on Bootstrap and are replaced by the node grammar and `crudui.css`. They are
removed rather than kept beside the current path:

- `@crudui/generator-react/legacy`, `@crudui/generator-vue/legacy` and
  `@crudui/generator-svelte/legacy` with their sources, the React
  `@crudui/generator-react/styles.css` stylesheet, and the tests that exercised them
  (16 React tests, the Vue and Svelte parity tests and captures, the Svelte legacy
  component test);
- `examples/legacy/demo-app`, `playground`, `legacy-bootstrap`, `legacy-compare`,
  `legacy-original`, `legacy-validate-test` and `react-usage.tsx`, with their
  docker-compose services and README entries;
- `tests/parity`, `tests/cross-framework`, `tests/legacy-client`,
  `tests/fixtures/reference-html`, `tools/legacy-baseline`, the root `compare`
  pages, the vendored `packages/generator-legacy` and the CI parity job, whose Vue and
  Svelte steps repeated the form-render job;
- the `lucide-react` and `yaml` dependencies of the React, Vue and Svelte packages,
  which only the legacy components used.

The legacy specification translation and validators (`@crudui/validator/legacy`
and its PHP, Go and Rust counterparts), the legacy validation API examples and their
shared specifications stay: they validate data and render nothing. The public
package test now checks that `@crudui/generator-core/crudui.css` is the only exported
stylesheet.

After the removal `npm run build`, `npm run lint` and the Svelte type check passed.
generator-core and HTML still passed 108 and 116 tests; React, Vue and Svelte passed
347, 341 and 338 (358, 7 and 11 fewer: the removed legacy tests), the Svelte client
10 and the Node checks 11. The form comparison source checks passed 140, the new
stylesheet export check passed, and `make docs-check` passed after the legacy schema
and visibility documents stopped linking the removed React sources. The same run
showed that the declaration compile check in `tests/build/public-packages.test.mjs`
and two dependency and pack checks were already failing; the next entry fixes them.

## 2026-09-13 — Style a form with crudui.css alone: widgets use the crudui grammar instead of Bootstrap

Widget markup still used the Bootstrap vocabulary inherited from the original form
(`form-control`, `form-select`, `input-group`, `input-group-text`, `btn`,
`btn-group`, `btn-check`, `btn-switch`, `flex-wrap`, a `data-toggle="buttons"`
attribute, and `p-0 border-0` on an unframed language group), and the core
stylesheet did not style any of it. The preview loaded Bootstrap from a CDN and the
comparison page styled the controls inside `#view`, so a form looked right only with
styles from outside the library. Widgets now follow the class grammar in all five
implementations and eight renderers: `crudui-widget` with `__affix`, `__button`,
`--search` and `--unsupported`; `crudui-input` with `--select` and `--file`;
`crudui-choices` with `__input`, `__label` and `--multiple`; an action widget button
is `crudui-action crudui-action--text`; and a framed language group is
`crudui-node--framed`. The widget model layouts `input-group` and `btn-group` are
now `widget` and `choices`. The only other classes a renderer writes are the
validation hooks `valid-target` and `valid-target-async`, the editor hosts and the
classes a spec declares, and the naming check now fails on any other class.

The core stylesheet is `@crudui/generator-core/crudui.css` (the `./styles.css` export
is removed). It styles every widget, and every rule is scoped to a crudui block,
including box sizing and hiding `[hidden]` elements. Pages style only their own
layout: the preview keeps its layout in the page and no longer loads Bootstrap, the
comparison page stylesheet no longer styles anything inside `#view`, and the SSR
documents of the comparison servers load `crudui.css`. The Go and PHP package
examples also take the form styles from `crudui.css` and no longer append their own
submit button, which duplicated the form footer's.

`make format-check` passed. generator-core, HTML, React, Vue and Svelte passed 108,
116, 705, 348 and 349 tests with the regenerated form-render and structure map
fixtures, the Svelte client 10, and the Node checks 11, including the naming check
that rejects classes outside the grammar. `make test-native` passed all 976 generator
checks (195 per implementation) with PHP API checks 361 per configuration and 103
validation cases. The comparison Go and Rust server tests, the comparison source
checks 140 and its Chromium checks 3, and `make docs-check` passed. In Chrome the
preview loads two stylesheets, its own layout and `crudui.css`, and renders inputs,
selects, textareas, checkboxes, language frames, the structure map and the footer
buttons without Bootstrap.

## 2026-09-13 — Format every Rust crate and Go file, and check it with `make format-check`

No check ran rustfmt or gofmt, so formatting drifted: five Rust crates had 62
rustfmt differences (54 in generator-rust, including code from the recent form
changes) and two Go files had gofmt differences. `tests/runner/go/run_test.go`
repeated its import alias (`validator validator "…"`) and did not compile at all.
All crates and files are now formatted and the import is fixed. `make format-check`
runs `cargo fmt --check` for every tracked `Cargo.toml` through the shared Rust
command entry point and `gofmt -l` for every tracked Go file, and fails on any
difference. The comparison Rust server test that compiles the spec by reference now
keeps `buttons` on the root, as the comparison checks do.

`make format-check` passed. generator-rust passed 20 and 4 tests, validator-rust
all its test targets, the comparison Rust server 4, `go test` for the legacy Go
validator and the Go test runner passed, the legacy Rust API and the Rust bench
built, and `make test-native` passed all 976 generator checks.

## 2026-09-13 — Record the passing four-server candidate run for the buttons and scrolling changes

`node examples/form-comparison/candidate-verification.mjs --ref e3f8c00` passed:
PHP, the PHP extension, Go and Rust each passed 1,452 checks with no failure, the
browser verification recorded 5,808 checks with no failure, and the command returned
status 0. It covers the form buttons (dd37759), the naming and DOM scenario checks
(6912b31), rendering nothing while scrolling (67f510e) and the two comparison fixes
the earlier runs found: the run for 67f510e failed in the PHP generation test
(fixed in fc2ee17) and the run for fc2ee17 failed in the reference compilation check
(fixed in e3f8c00).

## 2026-09-13 — Scrolling renders nothing: the current row is no longer instance state

Scrolling past a row made it current, and `connectForm` then called
`selectRow`, which published a new snapshot. Applications re-render on every
snapshot, so each row boundary crossed while scrolling replaced the whole form, the
structure map and the data view, and restored the focused control and its text
selection. With a control focused, the scroll was pulled back toward it. The
selection existed only to mark the map, so it is removed rather than guarded:
`FormInstance.selectRow`, the snapshot and view state `selection`, `RowSelection`,
`selectRowView` and `OutlineRow.current` are gone, and `setAllExpandedView` takes
only the nodes and the expansion. `connectRows(element)` tracks only form rows (map
rows carry their own `data-field-path`) and dispatches `crudui-current` when another
row becomes current. The new `markOutline(outline, form)` sets `aria-current` on the
map row of the form's current row; `connectOutline` calls it on that event and
whenever the map is rendered again, and the comparison `bindForm` controller calls it
for its map. `select-row` changes no state: `runAction` returns the row to move to and
the binding aligns it. With `multiple.controls: outline` the map renders every row's
controls and the stylesheet shows those of the current row.

The Chromium style checks now render the structure map next to the form and assert
that scrolling through the rows renders nothing and that the map marks exactly the
current form row at every step. A puppeteer probe of the preview, with two members
added and a control focused, measured one or two full renders per scroll gesture
before the change and none after it. generator-core, HTML, React, Vue and Svelte
passed 108, 116, 705, 348 and 349 tests with the regenerated structure map fixture,
the Svelte client 10, the Node checks (normalizer, styles and naming) 11, the form
comparison source checks 140 and its Chromium checks 3, and `make docs-check` passed.

## 2026-09-13 — Check the markup naming rules and the collapse and undo DOM paths

The class naming rules of the form markup (N1–N3: `crudui-{block}`,
`__{element}`, `--{modifier}` with its block, parts inside a node header, nodes
inside a body) were documented but not checked. `tests/form-markup/naming.test.mjs`
now checks every `crudui-` class in the form render and structure map fixtures
against the allowed blocks, elements and modifiers, and rejects five broken samples;
`npm run test:forms` runs it. The shared DOM scenario also collapses and expands
every row, checking each toggle's `aria-expanded` and the `hidden` body it names
with `aria-controls`, and undoes an edit, checking the control and instance values.

The naming check passed 2 tests, and React, Vue and Svelte ran the extended scenario
in their 705, 348 and 349 passing tests.

## 2026-09-13 — Form buttons in a pinned footer, and the space after the form outside it

Specs declare form buttons at the root (`buttons`, with a submission `action`), but
the schema rejected them and compilation kept only `properties`, so declared save,
cancel and back buttons disappeared. Buttons are now part of the form contract in
all five implementations. `buttons` is a list of `{ type: submit | reset | button |
link, text, name, value, href, design, behavior }`; a spec without `buttons` gets one
submit button. Submit and reset default to interface text; a button or link needs
`text` and a link needs `href`. `action` (`method`, `url`, `enctype`) is kept in the
template for the application. Both are rejected below the form root. The template
carries `buttons` and `action`, `bindButtons` evaluates them and the snapshot holds
them, and every renderer puts them in `crudui-form__footer`, one controls group whose
markup comes from `formButtonsHtml`. The footer pins to the bottom of the scroll
container at `--crudui-form-footer-height`, as sticky row headers pin to the top. The
JSON schema, the four validators, the CLI and the legacy translator accept the
declarations.

The row at the end of the form now reaches its line through space outside the form
instead of a minimum height inside the last row, which left a blank inside nested
cards. `connectRows` publishes two measured lengths on the connected element (the
extent from that row's top to the end of the form content, and its aligned top), and
the stylesheet gives `.crudui-form` a bottom margin of the viewport less those lengths
and the footer. Publishing on the form element itself let a re-render drop the
margin and pull the scroll back; the connected element is never replaced.

The form comparison servers (PHP, PHP extension, Go, Rust) appended their own
`_form_complete` submit button after the rendered form, which now rendered a second
submit button in its footer. The comparison spec, and the specs of the Go, Rust and
PHP generation tests, declare that button instead, the servers no longer append one,
and the generation checks require exactly one submit button in the document. The
first four-server candidate run of this change failed in the PHP generation test,
whose own spec did not yet declare the button. The second failed in the generation
check that compiles the published spec through a reference: it put the whole spec,
buttons included, in the referenced file, and composition takes only its fields, so
the referenced template got the default button. The frames compile through the
servers the same way, so their templates silently dropped the declared button too.
Both now keep the root declarations on the root and reference only the fields.

Validation passed: generator-core, HTML, React, Vue and Svelte passed 108, 116, 705,
348 and 349 tests, the Svelte client 10, the normalizer 6 and the Chromium style
checks 3. `make test-native` passed all 976 generator checks, with 361 PHP API checks
per configuration and 103 validation cases. The JSON schema passed 70 checks, the
TypeScript and PHP validators 1629 and 1461, the Rust validator 62, the Go validator
and the CLI 37. The PHP extension engine passed 22 tests, the cross-check console 117,
the form comparison source checks 140 and its Chromium checks 3, the Go and Rust
comparison server tests passed, and `make docs-check` passed. In Chrome the end row
stopped 0.2px from its line without a minimum height, and the space after the form was
a 200px margin outside it.

## 2026-09-13 — Show only form rows in the structure map

The structure map repeated every level twice: a collection line with its count
(for example "Stores 2") and then the row lines, each with its own guide line, and
it listed empty collections. It now follows one rule: one line per form row.
`buildOutline` returns `OutlineRow[]`, each row with the rows nested in it, so the
map nests exactly as the form does; `OutlineCollection` is removed. Collections,
counts and empty collections are not rows and stay in the form, and a nested row
body indents one step without guide lines. With `multiple.controls: outline`, row
controls still move to the selected row's map line, but an empty collection's Add
control is not a row control and now always stays in the collection footer in all
five implementations.

generator-core passed its typecheck and 104 tests; the HTML, React, Vue and Svelte
suites passed 116, 705, 348 and 349 with the regenerated structure map fixture;
form comparison source checks passed 140; and `make test-native` passed 976 generator
checks after the empty collection placement change in all five implementations. In
Chrome the map lists only rows with one indentation step per level. The four-server
candidate run for dad977d, the previous change, passed 1,452 checks per server
(5,808 browser checks) with no failure.

## 2026-09-13 — Align rows to their sticky line and follow the scroll with the current row

Sticky rows now follow rules derived from one value instead of computed offsets.
The row root carries `--crudui-sticky-depth` (moved from the header style in all
five implementations), and its sticky line is that depth times the header height.
The header pins on the line; the row's `scroll-margin-top` puts the header on the
line, so `alignRow` is `scrollIntoView({ block: 'start' })`; and the last row is at
least the viewport below its aligned top, so scrolling ends exactly when its header
reaches the line. An earlier draft of this change added one viewport of trailing
space, which let the page scroll past that point; it is not kept.

One rule decides the current row: the scroll position. `connectRows` marks rows
whose top reached their line (`data-crudui-stuck` on sticky rows) and the current
row, the last such row (`data-crudui-current`, with a highlighted border); the
selected row and the structure map follow it. Moving to a row after a row operation
or from the structure map scrolls it to its line. Focus no longer selects or scrolls,
and the bindings no longer restore scroll positions. A draft that also aligned the
row of a newly focused control, and restored captured scroll positions after
rendering, pulled the page back to the focused row when the user scrolled to the end
with an input focused elsewhere; both are removed. The comparison page controller
uses the same core functions.

`npm run test:forms` passed core 104, HTML 116, React 705, Vue 348, Svelte 349, ten
normalizer checks and nine node checks, including three Chromium checks: stacking at
exact header heights, the current row following the scroll with focus elsewhere, and
the end row stopping exactly at its line with no blank inside rows. Form comparison
source checks passed 140 and its Chromium checks 3. `make test-native` passed 976
generator checks after the depth moved to the row root in all five implementations.
`make docs-check` passed. In Chrome, with focus in the company name, wheel scrolling
reached the end without any backward jump, kept the focus, made 판교점 current and
stopped its top 0.2px from its aligned position.

## 2026-09-13 — Stack sticky row headers at their exact height

Sticky row headers (`multiple.header: sticky`) stack by offsetting each level by
`--crudui-node-header-height`, but a header's real height was its padding, content
and bottom border: 45px against a 44px offset in the reference preview, and more
when a long title or the controls wrapped. Each pinned level overlapped the one
above. A sticky header now has exactly that height, border included, never wraps,
and truncates a long title, so pinned levels meet without overlap. A stuck header
gets a solid background and a shadow, and its level label still shows only while
it is stuck. Stuck detection used an IntersectionObserver with thresholds 0 and 1,
which never fires for a row taller than the viewport, so the outermost pinned
level showed no label. `connectForm` now marks a header stuck when it has left its
natural place at the top of its row, measured on scroll and resize at most once
per animation frame. A Chromium check, `tests/form-styles.test.mjs`, runs in
`npm run test:forms` because jsdom has no layout. The form-structure preview declares sticky headers on all five
levels, which it did not before, so the sequential pinning was not visible there.

`npm run test:forms` passed core 104, HTML 116, React 705, Vue 348, Svelte 349, ten
normalizer checks and seven node checks, including the new Chromium check. That
check timed out waiting for the outermost stuck header before the detection change.
In Chrome the preview pinned all five levels in order with their labels and no
overlap.

## 2026-09-13 — Fix comparison checks that failed the four-server candidate run

The first candidate run of the initialization comparison failed 36 of 1,452 PHP
checks, and the other servers did not run. The empty-collection scenario step
excluded the Add button of a collection inside a row; that condition came from
the recursive node change. The bindForm controller focused the new row before
scrolling it, so the selection render restored the earlier scroll positions and
left the input outside the frame. It now scrolls first, like core. The createForm
checks asserted that the main page does not scroll, which contradicts the row
focus rule for a 1,450px frame; the checks now require the focused input to be
visible in both the frame viewport and the main page viewport. The local source
and Chromium suites do not run these checks; only candidate verification does.

The candidate run for e4d1375 then passed: PHP, the PHP extension, Go and Rust each
passed 1,452 checks with no failure, 5,808 browser checks in total, and the command
returned status 0.

## 2026-09-13 — Compare the two initialization paths side by side

The form comparison page now puts the two initialization paths in two columns:
the left frame creates the form with its data, and the right frame mounts an
empty form and then injects the data. The API choice (bindForm or createForm)
moved to a selector, next to the server, framework and language selectors.
Both columns run the same stages with the same fixed row keys: mounting,
repeated injection, hiding and restoring data, editing, saving, reloading,
copying, moving, removing, adding, saving the new row, emptying, restoring,
and the structure map's expand all, collapse all and undo. The columns run
one after the other because both save to the same record, and each right
stage is compared with the stored left stage. Raw HTML, DOM, control state,
fields, computed CSS, submitted data, focus and save responses are compared
without normalization. The list at the top updates as each stage completes.
The frames load the grammar stylesheet, so computed CSS reflects the real
styles. The in-frame initialization check is removed.

The bindForm path now supports the same actions as createForm (toggle, select,
expand all, collapse all, undo) with the same view state, history and focus
rules. generator-core exports those rules as pure view-state and history
functions, which the form instance and the bindForm controller both use. Both
paths render the structure map and the data view in their frames. React, Vue
and Svelte provide stateless `OutlineView` and `DataPanel` (Vue: `outlineVNode`,
`dataVNode`), and the HTML renderer adds `renderOutlineView` and
`renderDataPanel`. A shared fixture, `tests/fixtures/form-outline/cases.json`,
holds the React markup for four languages, top-level and nested selection,
`controls: outline` and data escaping, and all four renderers reproduce it. The
feature contract manifest records the view-state and history functions and the
new fixture.

`make test-native` passed 976 generator checks (195 per implementation), 361
PHP API checks per configuration and 100 validation cases in each PHP
implementation. `npm run test:forms` passed core 104, HTML 116, React 705, Vue
348, Svelte 349 and ten normalizer checks. The structure map fixture passed four
cases in each of the four renderers. Form comparison source checks passed 140
and the Chromium checks passed 3. `make docs-check` passed after documenting the
`UndoResult` type, a type-only change made after the native run. The full
candidate run with the four servers had not run when this change was committed.

## 2026-09-13 — Move focus to the affected row after row operations

Row operations previously kept the active control, its text selection and the
scroll positions, and a pointer press on a row button was prevented from moving
focus. The runtime now follows the focus rule of the reference form: adding or
copying focuses the new row, moving focuses the moved row, and removing focuses
the previous row, then the next row, then the enclosing row, then the collection's
Add button. Focus goes to the row's first enabled visible input, or to its toggle
or Add button, and the row scrolls only as far as needed. Toggling, selecting and
undoing keep the focused control, including a focused action button. Pointer and
keyboard activation behave the same. `runAction` returns `{ focus }` for the row
that receives focus, or `undefined` when the target is incomplete.

generator-core passed its typecheck and 102 tests. `npm run test:forms` passed
HTML 112, React 701, Vue 344, Svelte 345 and ten normalizer checks, with the shared
DOM scenario asserting the focused row after add, remove, copy, move, toggle and
removal of the last row. jsdom does not implement scrolling, so the tests stub
`scrollIntoView`. In Chrome, the form-structure preview focused the new row after
an add and the previous row after a removal. Instrumenting the calls showed the
row scrolls before focus, which prevents scrolling elements that a synchronous
re-render replaces. The automation tab did not scroll the window, so actual
viewport placement was not measured there. The comparison page focus checks move
to the same rule in the next change.

## 2026-09-13 — Render forms as recursive nodes with row cards

Every form renderer (HTML, React, Vue, Svelte, PHP, Go, Rust and the C PHP
extension) now produces one recursive node grammar instead of per-shape wrappers.
Each field, group, collection, row, language field and language item is a
`crudui-node` with `__header`, `__body` and `__footer` slots. Kinds are modifiers
(`crudui-node--row`), and behavior reads only `data-field-path`,
`data-crudui-row-key`, `data-lang`, `data-crudui-action`, `hidden` and ARIA
attributes. `bindForm` returns `NodeVM[]` with the same JSON model in every
implementation. The [form markup](docs/spec/form-markup.md) specification defines
the grammar and records the reference-form behavior that was not adopted.

- **Row cards:** rows show a hierarchical number, an optional title from
  `multiple.title`, and a count or nested-row summary. Move, add, copy and remove
  controls come in a fixed order, with disabled states computed from `min`, `max`
  and position in every renderer; the browser no longer adjusts them after
  rendering. `multiple.controls` (`header`, `footer`, `outline`) and
  `multiple.header` (`static`, `sticky`) are declared in the JSON schema, the four
  validators and the CLI.
- **Messages:** control labels, counts and summaries come from one ko/en/ja/zh
  table shared by all implementations.
- **Runtime:** form instances keep collapsed rows, the selected row and an undo
  history (100 entries, consecutive edits of one path merged) outside the record
  data. `buildOutline`, `connectOutline`, `resolveAction` and `runAction` are
  exported. React, Vue and Svelte provide `Outline` and `DataView`, and the HTML
  renderer provides `renderOutline` and `renderData`.
- **Styles:** `@crudui/generator-core/styles.css` holds the grammar styles.
- **Input rules** in all five implementations: `lang` must be a boolean or an
  object and `lang.only` a list of language-code strings or an object, at
  compilation. Binding rejects, in order, a non-string language, a non-string
  `keyPrefix` or `idPrefix`, an `unsupported` other than `throw` or `marker`, and
  an unsupported language. Previously TypeScript crashed on `lang: null`, the C
  extension read past its default language list for non-string `only` entries,
  and TypeScript treated any `unsupported` string other than `throw` as marker
  mode while PHP threw.
- **API changes:** Go `BindOptions.Language`, `IDPrefix`, `KeyPrefix` and
  `Unsupported` are `any`, `KeyPrefixProvided` is removed, and an empty `IDPrefix`
  is used as given. Rust `BindOptions` string options are JSON values.

`examples/form-structure` is a local preview of a five-level reference form.
The form comparison page, the shared DOM scenario and the cross-check console
now select by attributes.

`make test-native` passed 976 generator checks (195 per implementation plus the
unchanged-input check), 361 PHP API checks per configuration and 100 validation
cases in each PHP implementation, after reinstalling the copied PHP validator. `npm run test:forms` passed core 101, HTML 112, React 701, Vue 344,
Svelte 345 and ten normalizer checks. Form comparison source checks passed 137,
the cross-check console passed 117 after rebuilding the Go and Rust validator
binaries, and `make docs-check` passed.
## 2026-09-13 — Remove check directories after passing runs

`tests/native-generators/run.mjs` created a `crudui-native-generators-*` build
directory on every run and never removed it. `scripts/check-packages.mjs` left a
145 MB `crudui-consumer-*` project after every run. Repeated runs helped fill the
disk. A passing run now removes its directory. A failing run keeps it, prints its
path, and records it in the report (`buildDirectory`) or with `failure.log`. The
other test files already removed their temporary directories.

`make test-native` passed 886 checks and left no build directory.
`npm run test:packages` passed and left no consumer project. `make docs-check`
passed.

## 2026-09-13 — Reject wrong multiple and design value types at compilation

Form compilation in TypeScript, PHP, Go, Rust and the C PHP extension previously
ignored a wrong value type in `multiple` and `design`: row settings with the wrong
type were dropped, and an invalid design became an empty design. Compilation now
rejects them with `INVALID_FORM_INPUT` and `Invalid {key} at {path}: expected
{expected}`, where `{path}` is the field's structural path. `multiple` must be a
boolean or an object, with numeric `min` and `max` and boolean `copy` and
`sortable`. `design` must be a boolean or an object. Its `show` must be an
expression, a boolean or a condition map. Its `class` and `style` and those of the
`label`, `wrapper`, `group` and `prepend` nodes must be strings or condition maps,
and the nodes must be objects. A condition map is a non-empty object, as the JSON
schema requires. Unknown keys in these buckets are not checked. The schema
specification documents the rules.

The C template builds messages with a local helper because its engine tests link
only the value, error and composition modules. The native suite adds eight
compile rejections compared as complete records.

`make test-native` passed 886 generator checks (177 per implementation), 361 PHP
API checks per configuration and 100 validation cases in each PHP implementation.
generator-core passed its typecheck and 89 tests; `npm run test:forms` and
`make docs-check` passed.

## 2026-09-13 — Reject generator data with the wrong shape at its full path

`bindForm` and editable instances in TypeScript, PHP, Go, Rust and the C PHP
extension now apply the validators' data shape rules. Root data that is not an
object fails with `Form data must be an object`. A present group value or
repeated group row that is not an object fails with `Group data must be an
object: {path}`. A present repeated value that is not a keyed object fails with
`Repeated data must be a keyed object: {path}`. `{path}` is the full data path,
including row keys; instances previously reported only the field name, and
`bindForm` did not check group data. `addRow` checks a supplied group row value
at `{collection}.{key}`. The form runtime specification documents the rules and
check order. The form comparison controller's copy of instance normalization
uses the same messages and has a test for them.

The native suite checks eight data shapes through both `bindForm` and instances,
and the rejected-operation scenario adds nested `setValue` and `addRow` cases.

`make test-native` passed 846 generator checks (169 per implementation), 361 PHP
API checks per configuration and 100 validation cases in each PHP implementation.
generator-core passed its typecheck and 88 tests, the form comparison controller
passed 5 tests, and `npm run test:forms` and `make docs-check` passed.

## 2026-09-13 — Compare generator error messages across implementations

The native generator suite compared only error code and location, and its README
allowed messages to differ by language. That contradicts the requirement that all
implementations behave identically, so the rule now requires matching code,
message and location. Rejected form inputs are compared as complete records
against JavaScript.

The stricter comparison found 12 existing differences, now fixed:

- The PHP, Go and Rust generator CLIs reported non-object `data` as `Data must be
  an object`, `Group data must be an object` and `data must be an object`. All now
  report `Form data must be an object`.
- Go and Rust worded unsupported field types differently. Both now report
  `Unsupported field type "{type}" at "{path}"`.
- Go named `SequenceRowKey` in the invalid row key message; it now names
  `sequenceRowKey` like the other implementations.

`make test-native` passed 786 generator checks, 361 PHP API checks per
configuration and 100 validation cases in each PHP implementation.

## 2026-09-13 — Report validator load and input failures identically

The TypeScript, PHP, C PHP extension, Go and Rust validators reject submitted
data with the wrong shape as an input failure instead of skipping it or
converting it. Root data must be an object (`Form data must be an object`),
checked before composition. A present group value or repeated group row must be
an object (`Group data must be an object: {path}`). A present repeated value must
be a keyed object (`Repeated data must be a keyed object: {path}`). Each language
has `FormInputError` with code `INVALID_FORM_INPUT` and an empty location; Rust
returns `ValidateError::Load` or `ValidateError::Input`. Keyed rows are traversed
in sorted key order everywhere.

All four validator CLIs now share one process contract. A result exits 0 with
`{valid, errors}`, a load or input failure exits 2 with exactly
`{error, code, at}`, and a malformed request exits 1 with `{error}`. Before this
change, TypeScript and Go exited 1 without `at`, and PHP exited 0 with a
`rule: "compose"` error. Validation fixtures replace `expectLoadError: {code}`
with `expectFailure: {code, message, at}` and add six input-failure cases. Former
array-row cases use keyed rows. The fixture generator now contains the seven
end-date cases that commit `8688990` had added only to `cases.json`, so they are
no longer dropped on regeneration. The cross-check console compares the complete
`failure` record. The comparison and example servers answer an input failure with
HTTP 400.

Comparing complete records exposed a Go-only divergence. Go list validation
prefixed forbidden-key locations with `list.`, and a Go test pinned that
prefix. The shared list fixture and the other implementations use
`columns.<name>`, so Go now does too.

The C extension's allocation-failure fixture uses keyed rows, which need 4 and 3
allocations. Engine fixtures now emit only the C helpers they call. Before
testing, the ignored Go and Rust CLI binaries used by the console were rebuilt,
and generator-php's copied validator was reinstalled; all three predated the
source changes.

TypeScript validator 1618, PHP validator 1458, `go test ./...`, `cargo test` and
cross-check console 117 tests passed. `make test-native` passed 786 generator
checks, 361 PHP API checks per configuration and 100 validation cases in each PHP
implementation. `make docs-check` passed.

## 2026-09-13 — Bind repeated rows from keyed objects only

`bindForm` in TypeScript, PHP, Go, Rust and the C PHP extension creates repeated
rows only from keyed objects. Missing collection data creates one row keyed
`__0000000000000__`. An array, null or scalar collection fails with
`INVALID_FORM_INPUT` and the message `Repeated data must be a keyed object:
{path}`. Field paths no longer carry `#N` array-position segments, so the
position helpers were removed from all five implementations. Go's unused
`rowPosition` function was removed. The shared form fixture uses keyed data, and
the HTML conformance suite now includes the former array cases.

`npm run test:forms` passed (core 88, HTML 112, React 701, Vue 344, Svelte 345,
normalizer 10). `make test-native` passed 786 generator checks, including new
checks that require identical rejection code, message and path in all five
implementations. `make docs-check` passed.

## 2026-09-13 — Align repeated-row declarations across schema, validators and CLI

`multiple.min` is declared in the TypeScript, Go and Rust specification models,
accepted by the PHP `multiple` bucket and reported by `crudui explain` and
`crudui describe`. The PHP bucket previously rejected `min`, although the JSON
schema and form runtime define it. `multiple.copy` is a boolean in the JSON
schema; the object form had no runtime meaning. Model comments describe keyed
row identity instead of hidden identifiers and array order.

Schema checks (58 cases), TypeScript validator tests (1606), PHP validator
tests (1446), Go and Rust validator tests, CLI tests (37) and `make docs-check`
passed.

## 2026-09-13 — Add framework-independent HTML rendering and executable feature contracts

`@crudui/generator-html` renders current form and list view models as HTML
fragments without framework dependencies. It supports table and card lists,
current field shapes, widget layouts, escaping rules and raw display content;
browser event binding remains in `@crudui/generator-core`.

`contracts/features.json` now records package exports, feature contracts,
fixtures, test files, support status and verification commands. The manifest
schema and path checker reject missing links. `manifest:test` executes the
declared verification commands, and feature contract pages are generated from
the manifest. CI runs the manifest checks and commands before form tests.

The HTML renderer passed 110 package tests, including 87 form conformance cases
and 20 list conformance cases. Public package exports, declarations, consumer
builds, API documentation and `make docs-check` passed. The package is not
deployed.

## 2026-09-12 — Publish static documentation through GitHub Pages

The documentation build supports `DOCS_BASE_PATH` and generates explicit static
HTML links for English, Korean and API documents. Development, preview and 404
pages use the same URL prefix. CI checks documentation,
then deploys the generated site to `https://polyspec.github.io/crudui/` from
`main`.

`make docs-check` and `make docs-verify-idempotent` passed with
`DOCS_BASE_PATH=/crudui/`. Browser checks passed for desktop and mobile layouts,
Korean navigation, stylesheets and nested 404 pages.

## 2026-09-11 — Name the comparison deployment command explicitly

The local comparison deployment entry point is now named
`examples/form-comparison/comparison-deployment.mjs`. Verification procedures,
examples and tests use the explicit comparison deployment name.

## 2026-09-11 — Make native C fixtures compile with Linux toolchains

`packages/php-ext/tests/engine.test.mjs` now links `libm` when compiling native
fixtures and emits cleanup statements separately from guard clauses. The C
engine fixtures compile with the warning-as-error settings used by the PHP 8.4
and 8.5 CI jobs.

## 2026-09-11 — Build JavaScript prerequisites before native tests

`make test-native` now builds the workspace JavaScript packages before running
the C extension engine tests. The native test target provides the built React
generator package required by the engine rendering fixtures in a clean checkout.

## 2026-09-11 — Complete the independent C PHP extension

The PHP extension now implements its form and validation engine in C. The
engine owns ordered values and performs composition, expression evaluation,
template compilation, data binding, form and list rendering, validation, row
operations and PHP value conversion inside the extension process. The package
no longer contains a Cargo manifest, Cargo lock file or Rust source. The direct
builder compiles the complete C source set, and the form-comparison extension
stage no longer copies a Rust toolchain. The comparison generator check hashes
the root package lock file used by the candidate source archive.

The C engine checks passed 29 of 30 tests on macOS, with the Linux-only address
sanitizer test skipped. The module build and load succeeded; PHP API checks
passed 352 cases in each of three configurations and validation passed 94 cases
in each implementation. `make test-native` passed with 766/766 generator
checks, 19 protocol checks, all PHP, Go and Rust package checks, and the widget
and timezone checks. `npm run test:form-comparison` passed 136 source, 10
library and 3 browser-job checks. `make docs-check` passed. The extension and
comparison service are not deployed.

## 2026-09-11 — Render form fields in C

The C extension renders evaluated form fields as server HTML. The renderer
supports leaf, group, repeated and language field structures and all current
widget layouts. It preserves control attribute order, opaque event attributes,
raw display content and script and style elements. Text, attributes, URL values
and final CSS properties use the current rendering rules. Rendering does not
change the evaluated field models.

Focused C checks matched exact HTML for all 90 successful shared form fixtures
and two additional escaping and CSS cases. The same cases passed with strict C11
compiler warnings and undefined-behavior instrumentation. These changes are not
deployed.

## 2026-09-11 — Bind form fields in C

The C extension binds compiled templates to record data without changing either
input. Binding resolves presentation rules, translated content, repeated rows,
language fields, checkbox state and widget models. Explicit empty arrays and
objects produce zero repeated rows, while an omitted repeated value produces one
initial row. Unsupported field types return `UNSUPPORTED_FIELD_TYPE` unless the
caller selects the explicit marker result.

The widget implementation generates complete button and editor scripts and keeps
ordered model members. Focused C checks matched the complete ordered field models
for all 91 compilable shared form fixtures, confirmed input immutability and
completed the same cases with undefined-behavior instrumentation. These changes
are not deployed.

## 2026-09-11 — Evaluate form expressions in C

The C extension resolves object and array paths and evaluates literals, relative
paths, wildcards, comparisons, membership, boolean operations and ternary
expressions. Condition maps select the first matching declaration and use an
explicit `true` entry as the default. The implementation uses standard C11.

The focused C check passed all 38 shared expression specifications and their 77
evaluation cases with strict compiler warnings. The cases cover expression
values and boolean results. These changes are not deployed.

## 2026-09-11 — Compile form templates in C

The C extension composes explicit in-memory files, applies ordered references and
patches, detects reference cycles and returns composition error codes and traces.
Form compilation produces data-independent templates containing the template
kind, optional key prefix and recursively compiled fields. Field specifications
do not retain nested `properties`.

Focused C checks passed all 20 shared composition cases and compiled all 92 shared
form fixtures with the same ordered templates or errors as the JavaScript
implementation. The C sources compile with strict C11 warnings. These changes are
not deployed.

## 2026-09-11 — Add the C extension value model

The C extension engine stores nulls, booleans, integers, finite numbers, UTF-8
strings, arrays and ordered objects without PHP or Rust data structures. Values
own their strings, object keys and children. Copy, replacement and removal keep
object declaration order and produce independent values. Invalid UTF-8 and
nonfinite numbers are rejected.

The focused C test verifies ordering, replacement, deep copies, arrays, UTF-8 and
numeric equality. It passed with strict C11 compiler warnings and undefined
behavior checks. The macOS memory inspector reported zero leaks. The independent
C extension source check excludes declared build output and continues to reject
Rust source and Cargo files in the package. These changes are not deployed.

## 2026-09-11 — Use the Node.js 24 artifact action

Native PHP 8.4 and 8.5 CI jobs upload their comparison reports with
`actions/upload-artifact@v7`. This action declares the Node.js 24 runtime. The
previous action declared Node.js 20, so GitHub-hosted runners replaced its runtime
and reported a deprecation warning. Report names, paths, hidden-file inclusion and
missing-file failure behavior remain unchanged.

The CI configuration regression suite requires the current artifact action and
passed all four checks. These changes are not deployed.

## 2026-09-11 — Enforce npm 12 and sandboxed Chrome CI

The npm dependency policy permits a URL dependency only when the root manifest
declares it directly and pins it to an immutable source revision. Dependency
verification rejects URL dependencies introduced by another dependency. Package
consumer verification reads the current npm 12 `pack --json` report and requires
exactly one report for the requested package and archive.

Linux browser CI uses the regular Chrome file at `/opt/google/chrome/chrome` and
disables Puppeteer's browser download. The preflight rejects symbolic links in the
browser path, launches Chrome without sandbox-disabling arguments and requires
`chrome://sandbox` to confirm the active first-layer, PID, network and Seccomp-BPF
sandboxes. Both browser CI jobs complete this preflight before starting tests.

GitHub Actions run `34551049527` for commit
`a7ac873b5a2e47c398372a50ab8fb31a75823393` completed all 20 jobs successfully.
The run includes package consumer, public export and type, repeated build, browser
inspector and CSS, form-comparison regression, documentation coverage and PHP 8.4
and 8.5 native generation and PHP API checks. No job failed or was cancelled.
These changes are not deployed.

## 2026-09-11 — Verify clean CI installations

Repository-root form-comparison and cross-check commands declare their direct
JavaScript dependencies in the root manifest. Form comparison uses the root npm
graph, and the cross-check renderer resolves Vite and the Svelte plugin by package
name. Package consumer verification packs each package from its own directory and
requires one archive result.

The form-comparison CI job installs PHP 8.5 and the validator and generator
Composer graphs before running the complete suite. Native PHP matrix jobs pass
the regular versioned `php-config` path for the selected PHP release. Artifact
upload runs only after native verification creates the report.

A clean source archive passed 136 form-comparison source checks, ten generator
construction checks and three Chromium browser checks. Package consumer export,
type, production build and three-framework browser verification passed. Public
package checks passed nine cases, repeated builds passed one case, and the form
inspector passed 18 unit and six browser CSS checks. Cross-check rendering passed
33 cases. These changes are not deployed.

## 2026-09-11 — Preserve Svelte editable controls

The Svelte generator renders ordinary input and textarea controls as stable DOM
elements. Session value updates retain each element, focus and text selection.
Controls with string `on*` behavior attributes and controls that require exact
specialized HTML remain on the raw serialization path.

The browser connection formats date and datetime values from the current form
instance before updating live controls. Initial data and later injection use the
same value conversion.

Regression checks cover text, email, number, password, textarea, date and datetime
controls. The Svelte SSR and HTML comparison suite passed 345 checks, the mounted
browser suite passed ten checks, the generator core passed 86 checks and
`svelte-check` reported zero errors and warnings. This change is not deployed.

The complete `make test-native` command returned status 0. The run passed 11
extension build checks, 160 PHP generator tests, all Go package tests, 20 Rust
generator tests, 352 PHP API checks in each of three configurations, 94 validation
cases in each PHP implementation, 19 protocol checks, the 766/766 generator report
and five Chromium widget and timezone checks. The generator report SHA-256 is
`16ab371b3691429ca4e2c1a3eaa3c35fb7209861abd5759f16efea6c1a19aa5d`.

## 2026-09-11 — Verify explicit browser and PHP inputs

The Chromium widget check disables Vite dependency discovery and optimizes only
the five declared React and CRUDUI packages. It fails on page exceptions, HTTP
error responses, failed requests and `console.error` messages during every test
phase. The five widget and timezone checks passed.

The PHP form server reads the `crudui/validator` installation directory from
the selected generator vendor's `composer/installed.php`. Other registered
Composer installations do not affect package selection. The directory must be
inside the selected vendor directory. Every path component and loaded class file
must be regular, and the installed validator file must match the candidate source
file. A missing or malformed selected record, an external path or a changed
package copy fails construction.
The startup health check accepts `Generator` and `Form` only from the generator
source directory and `Validator` only from the selected Composer package copy.
It rejects the repository validator source path. A rejected health response
reports the server and the first response field that failed verification.

The PHP source and construction suite passed ten checks. Five hundred verified
constructions completed within the 250 millisecond limit. The PHP and PHP
extension integration check passed 125 generation checks in each mode together
with JSON conversion, storage, validation, public signature and processor-mode
checks. The form comparison build command passed 131 source checks and ten
construction checks.

Candidate source tests create writable fixtures under the canonical operating
system temporary directory. Every temporary path component must be a regular
directory and must not be a symbolic link. Candidate tests do not require Git
metadata or write under the extracted source directory. The candidate fixture
location regression check and all ten PHP construction checks passed.

## 2026-09-11 — Build PHP extensions directly

One PHP extension builder compiles and loads the CRUDUI and OrderedJSON
modules. Separate entry points declare each module's sources, outputs, platform
libraries and load checks. Candidate images use both entry points and do not run
`phpize`, Autoconf or libtool.

The builder resolves regular `php-config`, C compiler, Cargo and rustc files
before compilation. It rejects relative paths, symbolic links, missing or
ambiguous tools and mismatched PHP installations. Rustup identifies the regular
Cargo and rustc files in one selected toolchain. Cargo receives the regular
rustc and linker paths explicitly. Generated path cleanup validates every
declared target before removal and does not follow symbolic links.

The direct builds loaded both modules on PHP 8.5.10. The combined process called
both modules successfully. The PHP API check passed 352 checks in each of three
configurations and 94 validation cases in each implementation. Six builder and
entry-point regression checks passed.

## 2026-09-11 — Use explicit browser completion signals

The form-comparison runner subscribes to the main-page and frame readiness
messages before navigation. The interaction and typing verifiers reserve each UI
operation before activation and await that operation's completion. React and
Svelte complete synchronous updates with `flushSync`; Vue publishes `nextTick`
completion. The verifiers read DOM results only after renderer completion. They
do not use periodic DOM reads, network-idle inference or fixed rendering delays.

The documentation development server registers its recursive file-system
subscription before the initial build. It excludes generated `docs/.site/`
events, serializes rebuilds and combines source events received during one build
into one additional build. A build failure is reported and the next source event
can request another build. A file-system subscription failure closes the server
with status 1.

The candidate verification procedure runs one commit-specific lifecycle command.
The command prepares and builds the candidate, subscribes to its readiness file
before startup, runs the HTTP and browser checks sequentially and retains only
verified deployment evidence. The procedure does not use a sleep interval or a
readiness retry loop.

The form-comparison source suite passed 129 checks, the generator construction
performance suite passed four checks and the browser job suite passed one check.
The documentation suite passed 15 checks. A development-server check returned
HTTP status 200, rebuilt once for one source event and returned status 0 after
`SIGINT`.

## 2026-09-11 — Resolve the native Cargo command path

The `test-native` target supplies its expanded `PATH` when it starts Cargo. GNU
Make 3.81 now resolves Cargo from the directory added by the Makefile when that
directory is absent from Make's startup environment. A regression check runs the
target with simulated commands and places Cargo only in the added directory.

The regression check and all eight runtime policy checks passed. The complete
`make test-native` command returned status 0 with PHP 8.5.10 and passed 160 PHP
tests, all Go package tests, 20 Rust tests, 19 protocol checks, the 766/766
generator report and three Chromium widget and timezone checks.

## 2026-09-11 — Verify local comparison deployment

The repository verifies candidate metadata, generation, persistence, browser
reports, the exact local image tag and image digest before generating the local
comparison Compose file. Deployment preserves existing data without overwriting
different files. HTTPS verification uses the explicit containerctl certificate
authority and checks the source commit, route, certificate, data mount, stored
files and response bytes. A second identical application must leave every checked
value unchanged.

Successful deployment removes candidate containers, candidate directories, raw
reports, screenshots, previous deployment results and local comparison images
that the deployed service does not use. Eleven deployment cleanup checks and all
96 form-comparison source checks passed.

The checks include failed and stale evidence, exact report totals, deterministic
Compose output, data preservation, certificate authority loading, identical
reapplication changes and cleanup path boundaries. Deployment has not been
performed for this change.

## 2026-09-10 — Declare native test dependencies

Repository-root build and test entry points declare every directly imported
third-party package in the root manifest. The dependency check reads the Node.js
entry points executed by `make test-native` and rejects undeclared imports. The
widget script check resolves Vite 8.2.2 from the root dependency instead of a
transitive installation.

All six dependency checks passed. The complete `make test-native` command returned
status 0 with PHP 8.5.10 and passed 160 PHP tests, all Go package tests, 20 Rust
tests, 19 protocol checks, the 766/766 generator report and three Chromium widget
and timezone checks.

## 2026-09-10 — Enforce dependency install-script approvals

Each independently installed npm graph records exact-version approvals for all
dependency lifecycle scripts. Workspace packages use the root lock file. Clean
installs in CI and container builds use `--strict-allow-scripts` and fail before
installation when an approval is missing.

The dependency checks passed five of five tests across every tracked lock file.
The three browser applications built successfully, the parity suite passed seven
of seven tests, the runtime policy and package-build suites passed seven of seven
tests each, and the complete documentation check passed.

## 2026-09-10 — Current candidate verification

The cross-framework and legacy-client lock files resolve the current package
releases allowed by their manifests. Clean `npm ci` and `npm audit` runs reported
zero vulnerabilities. The cross-framework comparison passed 14 of 14 checks, and
the legacy-client comparison passed 5 of 5 checks.

Candidate `757f144b9c4b5e2dd5f5dfd91c09362b3edbcedd` built image
`localhost/crudui-form-comparison:757f144b9c4b` with index digest
`sha256:7842bd0a40f1e51d4c975008a9b5bdaf6d148e9faba05e68faf3a935b02fe2c7`.
Image construction passed 81 source checks and four library checks. Runtime
verification passed both PHP modes, 290 generation and SSR checks across 411 HTTP
requests, 120 persistence and validation checks, and three Ordered JSON checks.

Browser verification passed 312 checks for each server and 1,248 checks in total.
PHP completed in 213,288 milliseconds, the PHP extension in 206,475 milliseconds,
Go in 200,691 milliseconds and Rust in 200,500 milliseconds. The aggregate records
`complete: true`, `passed: true`, `failedChecks: 0` and
`performancePassed: true`. Packages and the comparison service were not deployed.

## 2026-09-10 — Complete public TypeScript API types

Package entry points export every named type referenced by their public
TypeScript declarations. Form and list validation use one public file-set type.
TypeDoc validation warnings now fail API generation and documentation coverage.
Two unexported-type regression checks, six public declaration checks and the
isolated five-package consumer check passed.

## 2026-09-10 — Selected runtime channels

`.node-version`, CI and Node.js container stages select Node.js 26 as the next
LTS release line without fixing a patch release. `.go-version`, CI and Go
container stages select the Go 1.27 stable release line. Rust CI and container
stages select the stable Rust channel. CI installs the current stable npm
release. All six runtime policy checks passed. Package lock files continue to
record resolved package versions.

## 2026-09-10 — Four-server candidate verification

The candidate image verifies one committed source archive before extraction and
runs the complete source suite as the application user before starting PHP, the
PHP extension, Go and Rust servers. Image construction passed 81 source checks
and four library checks. Runtime verification passed the Chromium process check,
290 generation and SSR checks across 411 HTTP requests, 120 persistence checks
and all PHP processor-mode and Ordered JSON checks.

The browser aggregate passed 960 scenario checks, 240 interaction checks, 24
mount-before-load checks and 24 static-document checks. Every server completed
below the 900,000 millisecond limit. The aggregate recorded zero failures and
`passed: true`. Packages and the comparison service were not deployed.

## 2026-09-09 — CI package and documentation checks

The documentation CI job installs both PHP package dependency graphs before
running `make docs-check`. A package and browser job packs the five JavaScript
packages into an isolated consumer, verifies public exports, declarations and
styles, compares repeated build outputs, and runs the form inspector unit and
Chromium CSS checks.

The package consumer, public build, reproducible build and form inspector checks
passed locally. Native PHP output through the three framework browsers remains a
separate comparison-environment verification and was not established by this CI
change. No remote CI run or deployment was performed.

## 2026-09-09 — Current and retained comparison documentation

The feature status now separates implemented native packages from the pending
four-server integration. The verification procedure requires an explicit library
path and commit, distinguishes the current PHP, PHP extension, Go and Rust targets
from retained comparison modes, and documents the two native modules, generation
checks and SSR routes. Browser use of serialized server-compiled templates is
implemented; seven focused unit tests, the complete Go server package, four Rust
server tests and 12 React, Vue and Svelte frame production builds passed locally.
The candidate image's complete four-server HTTP, browser and storage verification
remains pending and not deployed. The retained running image was not replaced.

## 2026-09-09 — OrderedJSON implementation submodules

The processor checker uses the pinned OrderedJSON common repository and all five
implementation submodules. It uses the current registry API, PHP namespace and
extension name, and rejects changed sources, malformed output and incomplete
results. Reports record source, fixture and module hashes.

The official processor checks passed 575 cases; the CRUDUI checks passed all
50 cases. Five checker unit tests passed and two invalid source inputs were
rejected. These results verify JSON processing, not browser or storage integration.

## 2026-09-09 — Native form generators and common PHP APIs

PHP, Go and Rust provide form compilation, data binding, editable instances,
form and list HTML, CLI adapters and HTTP examples. The CRUDUI PHP extension
registers the same Generator, Form and Validator classes as the PHP packages.
Its C binding converts PHP values directly to statically linked Rust engines.
The implementations share ordered value conversion, UTC date rendering, CSS
declaration handling and widget control contracts.

The shared suite passed 153 checks for each of five implementations and one
input-hash check: 766 passed, zero failed. PHP API checks passed 352 cases in each
of three process configurations; PHP and native validation passed 94 cases each.
Form package tests, packaged consumer checks and documentation checks passed.

The full `make test-native` command passed in a new non-root Linux arm64 image
built from the current source snapshot. It rebuilt and loaded the extension, ran
the PHP, Go and Rust package tests, repeated the PHP API and validation checks,
passed all 19 protocol checks and all three Chromium widget and timezone checks,
and produced another complete 766/766 generator report. The image index digest is
`sha256:0612f157880aa4bd9ff05a64dc6044969d0736117164cafec466e45d53c64c02`;
the report SHA-256 is
`3f8a91ccbbdaf72c116f2749aa4b6f5cee0975567f6edcbe1372e602cdcf7442`
and the run-log SHA-256 is
`378f4e3a63a88823b3a15b88859237332c27d36f43ee89bd62f9ad03cd38b0b1`.
This establishes native package verification, not the separate four-server
comparison integration. No package publication or comparison deployment was
performed.

## 2026-09-09 — Validator CLI responses

The comparison console checks process exit status, JSON response types, all
five error fields and consistency between validity and errors. It preserves
returned values instead of filling missing fields or coercing invalid types.
Specification load failures must match the CLI's documented response and exit
status. Process failures and malformed responses fail comparison.

Eight initial regressions failed before the fix. All 116 console tests passed,
including 35 response checks and execution of the four language CLIs.
`make docs-check` passed. These are local checks; no deployment was performed.

## 2026-09-09 — Runtime package contracts

The runtime contract defines form generation, SSR and validation requirements
for JavaScript, PHP, Go, Rust and the PHP extension. The PHP API contract specifies
common `CRUDUI\Generator`, `CRUDUI\Validator` and `CRUDUI\Form` classes,
extension registration before Composer class loading, and matching methods.
The implementation proposal maps packages, source coverage and required checks.
Feature status distinguishes these requirements from implemented packages.

The comparison documentation identifies native JSON parsing separately from
native CRUDUI generation and validation. `make docs-check` passed.

## 2026-09-09 — Legacy translation identifiers

Internal translation variables describe the translated field or schema value.
The naming contract covers file names, public APIs and internal identifiers.
The validator package build, all 1,606 validator tests and `make docs-check` passed.

## 2026-09-09 — CLI dependency build

CLI CI builds the validator package before running tests. Local instructions
include the same prerequisite, and documentation checks include the CLI README
and its Korean translation.

Removing validator output reproduced the missing-package failure. Rebuilding it
passed all 37 CLI tests, the four documented commands and two failure exit-code
checks. `make docs-check` passed.

## 2026-09-09 — Dependency update procedure

Scheduled dependency update pull requests are disabled. Dependency updates are
prepared locally and include the applicable package and documentation checks.
`make docs-check` passed.

## 2026-09-09 — Comparison environment verification

All four HTTP targets passed 120 current browser scenarios and 30 current
interaction checks each at `83181c2`, with no page errors. The image at
`dfe70a6` installs locked PHP dependencies and passed 240 HTTP checks and PHP
processor-mode checks. The external Compose environment serves local HTTPS
through `containerctl`; repeated `up` calls passed eight state and response
comparisons. English and Korean procedures describe the environment lifecycle.

## 2026-09-09 — Dependency installation and generated outputs

PHP CI jobs install dependencies from `composer.lock`. The PHP `vendor/`
directory and the compiled Go CLI executable are excluded from Git. Consumer CI
jobs build all required form packages, and the legacy comparison job runs its
regression checks. CI comments and step labels describe the commands actually run.

A clean Composer installation reproduced all 26 dependency versions and source
references. PHP passed 1,418 tests; four-language legacy comparison passed 1,074
cases; the cross-check console passed 81 tests. Documentation checks passed.

## 2026-09-09 — Public API descriptions

Public form and list API comments describe the current operations and error
results. The runtime contract uses form-instance terminology; legacy validator
examples import the explicit legacy entry. Removed an unused Vue type import and a reference to a nonexistent
options type. The five edited files produce identical executable JavaScript.
Package exports, strict consumer types, production rendering and repeat-build
checks passed.

## 2026-09-09 — End-date field references

TypeScript, PHP and Rust preserve `enddate` field-reference parameters, matching
Go. Dotted start-date paths no longer become boolean conditions that skip date
comparison. TypeScript and PHP use the common resolver for relative references.
The earlier-end-date regressions failed before the fixes. Seven shared cases
verify absolute, sibling and parent references and dates before, equal to and
after the referenced date. TypeScript
passed 1,606 tests, PHP passed 1,418 tests, and Go and Rust package suites passed.

The current rule contract is maintained in English and Korean under `docs/spec/`.
It replaces the mixed current/legacy rule document and separates registration,
parameter evaluation and verification evidence.

## 2026-09-09 — Legacy comparison correctness

The comparison runner loads the explicit JavaScript legacy entry and rebuilds
selected Go and Rust legacy executables. It rejects process failures, unreadable
suites and results that differ from fixture expectations. Source-loading and
developer-home fallbacks are removed. Two failure regressions failed before the
fix and passed afterward. All four implementations passed 1,074 legacy cases.
Default test commands include the runner regressions. English and Korean testing
instructions distinguish current conformance from legacy comparison.

## 2026-09-09 — Test fixture contract

The English and Korean fixture contract distinguishes current validation,
composition, expressions, rendering and legacy cases. It documents complete
validation results separately from load failures and removes outdated counts
from the format specification. The current and legacy TypeScript conformance
checks passed 1,124 cases. Documentation checks and the strict site build passed.

## 2026-09-09 — CLI composition failures and documentation

`check` reports unresolved composition instead of checking uncomposed input as a
substitute. The missing-reference regression failed before the fix and passed
afterward; all 37 CLI tests passed. The English and Korean CLI guide describes
the four registered commands. Package descriptions no longer list unimplemented
commands, and the unimplemented MCP proposal is removed.

## 2026-09-09 — Schema documentation consolidation

Current schema and expression contracts use their existing authoritative documents.
A separate English and Korean legacy schema describes the explicit legacy field
model. The duplicate root schema and condition-parser documents are removed;
references use the appropriate current or legacy contract. The legacy example
passed valid-input and custom required-message checks.

## 2026-09-09 — Legacy visibility contract

The English and Korean legacy visibility contract separates validator conditions
from renderer presentation. It documents map-form renderer processing and links
to the current schema's independent visibility and validation settings. The
duplicate visibility guide is removed. The selected TypeScript legacy
display-switch checks passed 84 cases.

## 2026-09-09 — Documentation site navigation

The site uses English navigation with a Korean index link. Generated API navigation
includes the shared generator core. Documentation checks, the strict site build
and generated navigation destination checks passed.

## 2026-09-09 — Data validation guide

The validation guide documents the current JavaScript, PHP, Go and Rust entry
points with `validate` rules. It separates schema loading, input failures,
visibility and transport processing. The outdated API guide is removed and
navigation uses the English guide with a Korean translation. All four code
examples executed successfully and detected the expected required-input failure.

## 2026-09-09 — Svelte generated output

Git excludes Svelte's temporary `.svelte-kit` output. The 117 generated files are
removed from tracking. Building without the preceding directory passed, as did
packaged exports, consumer type checking, the production build and browser checks
for React, Vue and Svelte.

## 2026-09-09 — Public API documentation generation

API generation fails when a required tool fails or its output is missing.
TypeScript checks all five public package entries, including Svelte component
declarations. Go documents all validator packages. Rust and PHP HTML references
are included in the static site. The documentation procedure specifies required
tools; the duplicate procedure is removed.

Eight generator failure tests, documentation checks, Svelte's 345 server tests
and 3 mounted tests passed. Two complete documentation generations produced
identical output, including native HTML assets. The strict site build passed.

## 2026-09-09 — Documentation link validation

The site checks internal links during builds. TypeDoc generates relative links
and package index pages. Existing repository files outside the site resolve to
GitHub source URLs; missing files fail. Five link tests run in `make docs-check`.
The strict site build, document checks and generated HTML link checks passed.

## 2026-09-09 — Maintained documentation navigation

Historical evaluation and implementation-comparison reports are preserved in the
external verification workspace and removed from the documentation site. The
site links to the maintained expression contract. Documentation maintenance
instructions identify the current example index checked by `make docs-check`.
The document checks and static site build passed.

## 2026-09-09 — Shared AST evaluation for ternary parameters

Form appearance and TypeScript, PHP, Go and Rust validation parameters evaluate
complete ternary ASTs. Selected field paths, nested true branches and quoted
escapes no longer use separate string parsers. Three form regressions and one
validation regression failed before the fix and passed afterward. Six shared
validation cases cover path-valued and nested limits. Existing validation results
and expected form HTML remain unchanged. The class-name fixture now quotes its
string branches.

The expression contract is maintained in English and Korean under `docs/spec/`.
It documents current boolean conversion separately from required-input validation,
operator precedence and condition-map defaults. CLI descriptions use this contract.
All four validator suites, all form suites, 36 CLI tests and documentation checks
passed. These results do not update the preserved external browser comparison.

## 2026-09-09 — Current API and fixture descriptions

Console documentation uses the current rendering API name. Composition and
rendering fixture descriptions state their behavior without implementation-version
labels. All 23 targeted composition tests passed; fixture inputs and expected
results are unchanged.

## 2026-09-09 — Independent historical comparison workspace

Historical comparison applications, pinned sources, build inputs and reports are
preserved in an independent external workspace. Package tests use repository-local
form inspection and JSON order checks. All 50 JSON order cases and the complete
form test suite passed after separation.

## 2026-09-09 — Reusable form inspector

The form inspector and its Node and browser checks are maintained under
`tests/form-inspector/`. Framework initialization tests use that module directly.
All 18 Node checks and six browser checks passed after relocation.

## 2026-09-09 — Bundled example specifications and nested data

The Bootstrap example includes product and repeated-form specifications in its
static build. Controlled pages apply complete form data instead of assigning
dotted paths as top-level keys. The application build and browser checks for
contact, registration, product and repeated forms passed, including nested
product data and rejection of an unintended dotted key.

## 2026-09-09 — Controlled legacy React updates

Legacy form change notifications execute outside React state updater functions.
Consecutive field changes preserve prior values and notify the controlled parent
once per change. The regression failed before the fix. All 692 React tests and
the package build passed after the fix.

## 2026-09-09 — Legacy example layout and builds

Legacy examples use `examples/legacy`. Imports, package references, build contexts,
tests and documentation use the relocated paths. Container builds install and
build the complete workspace through package commands. PHP integration classes
use individual PSR-4 files. The Node example lock file reflects current manifests.

Local frontend builds, Go tests, Rust compilation, five PHP API checks and Node
HTTP valid/invalid cases passed. Composer strict PSR-4 generation and documentation
checks passed. Linux images for the frontend examples, Node, PHP, Go and Rust built.
All four server images passed valid and invalid HTTP cases. PHP Apache routing
and its document root passed. Frontend browser verification remains pending.

## 2026-09-09 — Repeated-field schema

The declaration schema accepts `multiple.min` and describes collection-key row
identity without hidden fields. Schema validation passed 56 fixtures, including
minimum-count acceptance and rejection of a nonnumeric minimum.

## 2026-09-09 — Current comparison image

The comparison image builds library source `a5b4491` with normal dependency
installation. The image installs the browser archive extractor and resolves
native JavaScript build dependencies through the workspace lock file.
The local comparison environment runs PHP, PHP extension, Go and Rust.
All 240 HTTP checks and PHP processor-mode checks passed. Browser comparison
is in progress for this source and dependency graph.

## 2026-09-09 — Dependency installation and package checks

The workspace lock file resolves declared dependency ranges and includes native
packages for supported platforms. The root declares Vitest for shared test
integration. npm install-script approvals identify reviewed package versions.
The isolated consumer uses normal installation with the same script approvals.

Clean installation, public package checks (5), repeated build comparison (1),
consumer types, production compilation and three-framework browser checks passed.
Form checks passed: core 26, React 691, Vue 344, Svelte 345 and 3 mounted checks,
and 6 HTML normalizer checks. JavaScript validation passed 1,579 tests.
These results do not establish deployment of the comparison environment.

## 2026-09-09 — Field error descriptions

Unsupported field errors identify the field type and path. Current test names
use unversioned operation names. Core checks passed: 26 tests. Documentation
checks passed.

## 2026-09-09 — Independent PHP extension target

PHP extension execution uses a separate process, repository and server identifier.
The native processor is required in extension mode and prohibited in PHP mode.
Server and browser checks include PHP extension as a fourth target.

An isolated container passed 240 HTTP checks across four targets, including
processor-mode assertions. Both PHP codec modes and rejection of missing or
unexpected extensions passed. Full extension browser verification remains pending.
The main comparison container has not yet been replaced with this image.

## 2026-09-09 — Empty collection browser checks

Browser checks locate the collection containing the focused button through its
field wrapper. The current renderer no longer uses wrapper name attributes.
All 18 current empty-collection checks passed across three servers, three
frameworks and both transports. The PHP run passed all six current initialization
comparisons and 30 current-runtime pointer/keyboard interaction checks
(108 across all comparison modes), with no page errors.
Retained source HTML differences remain recorded as failures.

## 2026-09-09 — Shared SSR comparison instance

The cross-check console creates one form instance for the three renderers.
Generated row keys are identical across framework outputs when repeat data is
missing. Console checks passed: 81 tests, including the generated-key comparison.

## 2026-09-09 — Comparison server entries

Current PHP, Go and Rust servers use unversioned validator entries. Retained
Go and Rust servers build from a pinned server-source archive. The comparison
container uses library source `30ff267`. All 180 HTTP persistence checks passed.
Browser lifecycle verification is in progress. No package was published.

## 2026-09-09 — Comparison browser entries

Comparison browser builds select current and retained source entries explicitly.
Current collection checks use field paths. The build requires an explicit
absolute workspace path. All twelve browser bundles built successfully.
Server integration and lifecycle verification remain pending; the running
comparison environment has not been replaced.

## 2026-09-09 — Public declaration builds

TypeScript package builds generate JavaScript with the bundler and declarations
with the TypeScript compiler. Public entries include the declared legacy exports.
Declaration compilation uses `noEmitOnError` and no deprecated-option suppression.
Watch commands regenerate declarations after successful JavaScript builds.

Verification: clean installation and the full build passed. Five public package
checks passed, including strict ESM/CommonJS type consumption, stylesheet output
and rejection of invalid public declarations. Two complete builds produced
identical output paths and SHA-256 digests. An isolated packaged consumer passed
type checking, production build and three-framework browser checks. Runtime
source files were unchanged by this build change. Packages were not published.

## 2026-09-08 — Form instances and input controls

The form API prepares templates with `compileForm`, creates editable instances
with `createForm`, renders `Form` components and accepts an instance in
`renderForm`. List renderers use the same `layout` option. Native controls have
stable, scoped label identifiers; multiple-choice controls submit arrays.
Field containers use `data-field-path` instead of a submission name.
Svelte packages include generated component declarations. Package dependencies
use the `0.0.1` package version. Validation comparisons fail when a required
engine fails, is missing or returns duplicate results.

Verification: 1,409 form tests, 1,579 JavaScript validator tests, 1,392 PHP tests,
Go and Rust tests, 42 console tests, 18 inspector tests, Svelte type checking,
package consumer compilation/build and documentation checks passed.
The running comparison container has not been updated to this source.

## 2026-09-08 — Record restoration HTML

The shared DOM binding places an existing `checked` attribute after the input's
other attributes. Initial rendering and record restoration now use the same
attribute order without replacing the input. The shared regression compares the
complete restored HTML and verifies that checkbox elements remain unchanged.

Verification: the stricter regression failed in React and Vue before the fix.
Generator builds, all 1,405 generator tests and 18 inspector tests passed after
the fix. Source `f4ec125` passed all 360 current-runtime scenarios across 18
server/framework/transport combinations. All 3,024 initialization, repeated
injection and restoration category comparisons passed, including 378 exact HTML
comparisons. The 24 previous restoration differences are resolved.

All 324 actual interactions, 36 mount-before-load checks, 36 static documents,
180 HTTP checks, 36 typing cases and six Chrome CSS detection checks passed.
Korean React and English Vue checks through Rust verified the inspector button,
all 168 categories per run and exact JSON/HTML downloads. No browser page errors
occurred. The complete matrix records 1,290 passed and 150 failed scenarios;
all remaining failures belong to retained sources and match their previous results.

An intermediate run recorded an additional CSS failure after a progress-monitor
connection changed the browser viewport. The monitor was removed, the viewport
change was reproduced separately, and the full matrix was rerun at 1680 × 1100
without an additional connection. Both runs and previous reports are retained.
All 2,160 exported HTML snapshots match the recorded strings. Deployment: the
local container uses `f4ec125`; all 52 example files, the DOM binding source and
served metadata match the verified source. No package was published.

## 2026-09-08 — Form initialization inspector

Added initial-data creation and post-mount injection comparison using the parsed
browser DOM, unmodified HTML, live/default controls, ordered fields, computed CSS,
focus and saved records. The inspector retains category failures and continues
through repeated injection, record replacement and the same row actions. The
example provides a separate check button and downloadable HTML and evidence.
Static HTML responses are checked independently from mounting before data loads.
React now removes the empty style attribute when resolved inline styles are removed.

Verification: generator builds, 1,405 generator tests, 18 inspector tests and six
Chrome CSS detection checks passed. At 15:35 UTC, all three API servers completed
72 reports containing 1,440 scenario results: 1,278 passed and 162 failed.
Current-runtime initial-data/post-mount comparisons passed in all 18 combinations
at 15 stages. Repeated injection passed, including raw HTML. Record restoration
retained 24 raw HTML attribute-order differences in React and Vue; all current
DOM, CSS, control, data, focus and persistence comparisons passed. Historical
renderer differences remain recorded. Each server runner returned status 1.

All 324 interactions, 36 mount-before-load checks, 36 static HTML checks, 180 HTTP
checks, 36 typing cases and 54 bilingual UI selections passed. No browser page
errors occurred. Exported 2,160 stage snapshots and retained the stopped 42-report
run. Browser protocol calls now execute one API server at a time. Complete report
JSON omits indentation because the indented DOM records exceed the runtime string
limit; snapshot content is unchanged. Deployment is the local Apple container at
`localhost:4317`; no package publication or remote deployment.

## 2026-09-07 — Empty collection merge

Merged the empty-collection correction into `main`, retaining stable row keys and
focus handling. Empty collection Add buttons have an accessible label in React,
Vue and Svelte. Six regression tests cover explicit empty values, missing data,
visibility and nested row order. The tests use the current root group contract.

The pinned correction source is included in `main` history, so preparing the
comparison from a full clone does not require a separate branch.

Verification: generator builds and 1,402 tests passed (core 25, React 689,
Vue 342, Svelte 345 and Svelte client 1). The regression tests use `compileForm`
and `bindForm`. Deployment: no package publication; the local comparison
continues to use its existing pinned sources.

## 2026-09-07 — PHP, Go and Rust form persistence

Added independent Go and Rust servers alongside PHP for native form and JSON
submission, existing CRUDUI validation, atomic JSON storage and hierarchy reload.
Each server and source revision uses its own repository. Go and Rust binaries
compile against the displayed validator revision. Node serves browser assets and
forwards request bytes. Shared fixtures define identical stored records.

The page selects the server and retains that selection when changing language.
Form fields follow the string contract, and multilingual titles accept the
specified `ko` and `en` fields. Invalid structures, reset requests, oversized
requests and invalid required values are rejected without changing records.

The 13:47 UTC browser report contains 72 reports and 1,368 scenario results.
Corrected original and current runtime each passed 19/19 for PHP, Go and Rust in
React, Vue and Svelte with both form and JSON transmission. All 324 interaction
checks and 36 mount-before-load checks passed with no browser page errors.
Unchanged original keyed diagnostics remain 17/19 and array diagnostics 15/19;
the complete runner returned status 1 for the 108 retained diagnostic failures.
All 180 shared HTTP checks, 36 typing checks, 54 bilingual UI selections,
JavaScript/PHP conversion checks, PHP repository checks, Go static analysis,
Rust Clippy and `make docs-check` passed. Earlier failed reports were preserved.

Deployment: local Apple container at `localhost:4317`, using PHP 8.4.24,
Go 1.27.0, Rust 1.98.0 and Node 26.8.1. No package publication or remote deployment.

## 2026-09-07 — Original-controller typing

The original example controller could overwrite newer input with an earlier
rendered value and temporarily lose focus when a framework replaced an input.
It now cancels superseded input renders and restores values and focus immediately
after React, Vue or Svelte commits the DOM. The fixed two-frame delay was removed.

Verification at 13:41 UTC: all 36 native keyboard cases passed across four
comparison variants, three frameworks and 0/10/50 ms character intervals.
Immediate and settled text, focus and caret checks passed; no browser page errors
occurred. Library source snapshots are unchanged. Deployment is the local Apple
container at `localhost:4317`; no package or remote deployment was published.

## 2026-09-07 — Form comparison naming and source references

Applied consistent CRUDUI example names to paths, source, documentation,
container commands and Git history. Updated historical source references after
rewriting commits. All 166 commits and 5,854 Git objects passed the naming audit.
Comparison library and test files retain their original content. Previous data,
reports and source archives were preserved outside the working tree.

Verification at 12:21 UTC: corrected original and current runtime each passed
19/19 in React, Vue and Svelte for both form and JSON transmission. All 108
interaction checks, 12 mount-before-load checks, JavaScript/PHP conversion checks,
both repository checks and `make docs-check` passed. No browser page errors
occurred. Unchanged original keyed diagnostics remain 17/19 and array diagnostics
15/19; the full runner returns status 1 for those recorded failures.
Deployment: local Apple container at `localhost:4317`; no package publication or
remote deployment.

## 2026-09-07 — Form and ordered JSON transmission

Each form can select native multipart or JSON transmission. Both formats run
the same existing JavaScript/PHP validation and repository save. The JSON path
uses ordered-json `deb1b354` for requests, responses and storage files. Separate
transport modules convert its values to form records while preserving the
13-character keys, document order and empty collection types. The container
build includes the pinned source and displays its archive hash.

Added complete lifecycle checks for both transmission choices, identical-data
storage comparisons and malformed JSON rejection. Actual browser requests verify
the selected Content-Type and JSON shape. Invalid browser values block both
formats; invalid direct requests preserve stored records. Required/optional and
display rules continue to use the existing validators.

Verification at 11:35 UTC: corrected original and current runtime each passed
19/19 in React, Vue and Svelte for both formats. All 108 real interaction checks,
12 mount-before-load checks, JavaScript/PHP conversion checks and both repository
checks passed. JavaScript, PHP, Go and Rust validation conformance and
`make docs-check` passed. No browser page errors occurred. Unchanged original
keyed diagnostics remain 17/19 and array diagnostics 15/19 in both formats;
their existing failures remain recorded and the complete runner returns status 1.
Deployment: local Apple container at `localhost:4317`; no package publication or
remote deployment. Comparison sources and previous reports remain available.

## 2026-09-07 — JSON processor contract verification

Added a reproducible check against ordered-json `deb1b354` for document member
order, nested 13-character row data and empty collection types. All five
implementations passed ten transport fixtures and the processor's 115 common
cases. The fixtures verify JSON representation; browser behavior and runtime JSON
integration did not change. The local comparison remains available.

## 2026-09-07 — Empty collection correction and browser validation

- Added corrected original source `78723bb` to the primary comparison with current
  runtime `b516226`. The unchanged original keyed and array diagnostics remain
  selectable with their actual failures.
- Connected the existing JavaScript validator before user submission. Invalid
  values stop transmission and display field errors; reload clears obsolete errors.
  PHP independently validates the same rules. No validator rules changed.
- Verified optional blank department storage, hidden required-field failures,
  empty collection visibility, nested and complete deletion, re-addition,
  native/JSON persistence, sibling IDs and parent relationships.
- Added real typing, invalid/valid request counts and empty-collection keyboard
  focus checks. Frame scenarios run sequentially to avoid focus interference.
  The runner preserves prior reports and screenshots before writing new results.

Verification at 10:15 UTC: both primary implementations passed 17/17 in React,
Vue and Svelte. All 54 interactions, 12 mount-before-load checks and both PHP
repository checks passed; no browser page errors occurred. The unchanged original
keyed diagnostic remains 15/17 and the array diagnostic remains 13/17, so the
complete runner returns status 1. Existing shared validation cases passed in
TypeScript, PHP, Go and Rust. `make docs-check` passed.
Deployment: local Apple container at `localhost:4317`; packages not published.
Comparison sources and historical reports remain available for review.

## 2026-09-07 — Focus during native typing

Ignore unchanged input/change events before capturing focus. A native change
event during input replacement previously cleared the pending focus state in
Vue and Svelte, so typing stopped after the first character.

Verification: full Chrome checks retained the complete typed value and input
focus in React, Vue and Svelte. Shared mounted DOM checks and core type checking
passed. Deployment: local comparison environment; packages not published.

## 2026-09-07 — Focus after adding to an empty collection

The browser binding identifies the empty collection's Add button by its wrapper.
After the first row replaces that button, it restores focus to the Add button in
the same collection with `preventScroll`.

Verification: the shared mounted DOM scenario and real Chrome empty-collection
keyboard checks passed in React, Vue and Svelte; core type checking passed.
Deployment: local comparison environment; packages not published.

## 2026-09-07 — Focus during row operations

Row button pointer activation preserves input focus. DOM synchronization restores
text selection and ancestor scroll positions with `preventScroll`. Keyboard
activation retains focus on an existing button. Generator builds and mounted DOM
checks passed in React, Vue and Svelte. Real browser pointer and keyboard checks
passed in all three frameworks. Deployment: running in the local form comparison example;
packages not published.

## 2026-09-07 — Browser comparison and PHP persistence

- Added an Apple container environment for React, Vue, Svelte and PHP at
  `localhost:4317`, with exact original and current Git source snapshots.
- Added a primary comparison using identical 13-character keyed data. The original
  public functions use an example row controller and cached binding; the current
  runtime uses its library session. Original library source remains unchanged.
- Added original-public-function cache preparation with `composeProperties`,
  serialized structure restoration and `buildField` binding. Both keyed adapters
  read a composition reference once and reject further loading after preparation.
- Added native PHP parsing, revision-specific validation, atomic JSON persistence,
  parent ownership, scoped saved-key application, deletion and independent reload.
  Invalid or truncated requests preserve stored records.
- Added ID order `[5, 7, 1]`, insertion as ID 8 and subtree copying as ID 9.
  Keyed JSON uses document member order without additional order or identity
  fields. Editing document order changes stored and rendered order.
- Separated populated row-operation fixtures from explicit empty-collection checks.
  The comparison preserves empty-rendering failures without filtering generated rows.
- Mounted each form before its initial PHP data request. Browser request inspection
  checks that nested inputs exist before the request continues.
- Retained the earlier hidden-field array diagnostic as a selectable example.
  Its hidden fields and lack of cached binding are example configuration choices.
- Added pointer, keyboard and checkbox checks, manual controls, data inspection,
  downloadable results, raw error details and matching English/Korean documents.
  Failure explanations identify example configuration and original renderer behavior.
- The browser runner returns status 1 for any failed check, incomplete result or
  browser error. Recorded diagnostic failures remain failures.

Verification: in each framework, the current runtime passed 17/17 scenarios,
original keyed binding passed 15/17, and the retained array diagnostic passed
13/17. Original keyed failures both concern explicit empty-collection rendering.
Cache binding passed in both keyed examples. All 27 interaction checks, nine
mount-before-load checks and both PHP repository checks passed. No browser page
errors occurred. The comparison runner returned status 1 for recorded failures.
[Feature status](docs/features.md) records the current code's results.
Deployment: local Apple container; packages not published and no remote deployment.
The comparison artifacts and historical results remain available for review.

## 2026-09-07 — Compiled forms and 13-character row keys

- Added immutable, JSON-cacheable form templates and separate data binding.
- Added editable sessions with late data injection and scoped nested row addition,
  copying, removal, ordering and saved sequence key updates. New row keys contain
  13 hexadecimal characters; saved sequence keys contain 13 padded decimal digits.
- Connected native inputs and row buttons in React, Vue and Svelte. Corrected
  checkbox data rendering, explicit empty defaults, formatted date synchronization
  and React FormBuilder data prop replacement.
- Extended keyed scalar and group collection validation in four languages, with
  five shared cases for error paths, uniqueness and minimum count.
- Removed the combined `buildForm` entry and obsolete render aliases. SSR source
  functions accept compiled templates.
- Updated form contracts and usage documents with English and Korean versions.
  Added link, translation and status checks and included generator-core API
  documentation in the existing coverage check. Removed outdated form-key and
  schema documents after consolidating current contracts under `docs/spec/`.
- Replaced developer checkout paths with repository-relative imports or required
  external input paths. Corrected fixture regeneration to update existing cases.

Verification: core 19 tests; React 689; Vue 342; Svelte 345 SSR/unit and 1 mounted
DOM test; TypeScript validator 1,579; PHP conformance 61; Go and Rust shared
validation conformance passed. These runs include 43 shared CRUDUI validation cases.
Console SSR 32 tests, CLI 35 tests, lint, type checking and `make docs-check`
passed. API generation, schema generation and the documentation site build
passed. Deployment: not deployed.

## 2026-09-07 — Schema generation

Removed the unnecessary `ignoreDeprecations: "6.0"` compiler setting because the
schema generator's bundled TypeScript compiler rejects it. TypeScript type
checking, schema generation with three example checks, and the documentation
site build passed. Deployment: not deployed.
