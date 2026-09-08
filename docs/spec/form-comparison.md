# CRUDUI form comparison

[한국어](form-comparison.ko.md).

The example is maintained in `examples/form-comparison/`. Its page displays the
CRUDUI name. Browser checks use the example-local `window.comparison` controls.
Local container files and verification reports are stored in `.form-comparison/`.

## Server implementations

PHP, Go and Rust implement the same native form and JSON request contract. Each
server parses the request, runs its own existing CRUDUI validator, saves its own JSON
repository and reconstructs the hierarchy on reload. Servers do not delegate
validation or persistence to another language. A Node HTTP process serves the
browser assets and forwards request bytes to the selected server.

The page selects a server and framework. Both comparison frames use that server;
the original, corrected and current validator sources match the displayed source
revision. Go and Rust binaries are built separately for each source revision.
Every server runs the same lifecycle and interaction checks for both transports.
Implementation and verification are tracked in [feature status](../features.md).

All servers preserve native field order and ordered-json document member order.
They reject incomplete native submissions, invalid collection types, invalid
JSON and unsupported media types before saving. Stored records contain the same
IDs, parent IDs, positions and values for equivalent requests. Existing validation
rules determine required and optional values independently of visibility.
Each server, comparison variant and framework uses an independent repository.
Scalar form fields and sequence identifiers are strings. Omitted or null scalar
controls normalize to empty strings; numeric, boolean and composite field values
are rejected instead of using language-specific string conversions. The checkbox
default is the string `"1"`. Requests are limited to 2 MiB and 10,000 native fields.
The example does not accept uploaded files.
The multilingual `title` object accepts the `ko` and `en` fields declared in the
specification. Numeric indexes and other language fields are rejected in both
native and JSON submissions.

## Form behavior

The browser receives static HTML, CSS and JavaScript. The HTML response contains
an empty form container; the browser mounts the nested form before requesting
record data. The same static HTML is served for each selected API server.
"Create form with saved data" creates the form with its initial record. "Mount
empty form" followed by "Reload saved data" injects into the existing form.

The initialization check compares these two paths directly. It compares exact
form HTML, live and default control values, ordered native fields, JSON data,
focus and selection, and every computed CSS property for elements and their
`::before` and `::after` pseudo-elements. The same record is injected repeatedly
to verify idempotence. The check then repeats editing, visibility changes,
saving, reloading, copying, reordering, removal, addition and empty data.
PHP, Go and Rust receive both form and JSON submissions from each path.

Row-action replay supplies the same seven-byte random inputs in each path and
restores the browser random function afterward. Generated keys remain part of
the exact comparisons. Reports retain the HTML and control state at every stage,
CSS hashes, and full CSS snapshots when CSS comparison fails. The runner exports
these records under its timestamped initialization artifact directory.

The inspector records raw HTML equality and DOM equality separately. DOM
comparison includes every element, attribute name and value, text and comment,
and child order. Attribute enumeration order is reported by the raw HTML check;
it does not change DOM attribute equality. Neither comparison removes attributes,
classes, styles, row keys or hidden elements. A raw HTML mismatch remains a
failed check even when the DOM comparison passes. Comparisons continue after a
mismatch so subsequent CSS, control, interaction and persistence results remain
available. Tests deliberately change each snapshot category to verify detection.
Downloaded evidence identifies the time, server, variant, framework, transport
and library source commit. A failed reset must not reuse a previous run's evidence.

The example uses the existing `Validator` before user submission. Failure stops
transmission and displays returned field errors. Each selected server independently validates the
same spec. Visibility does not change validation: a hidden required field with an
empty value fails; optional empty values remain valid. No example-specific
required rules, value filtering or automatic values are added for validation.
Shared cases check these rules in TypeScript, PHP, Go and Rust. Rendering checks
separately verify visibility, native names and editing. Direct invalid requests
in server tests deliberately bypass the browser to verify server rejection.

A corrected original-source variant uses zero rows for explicit empty arrays and
objects, and an Add button in each empty collection. Missing data still creates
an initial row. The example controller inserts into the collection owning the
button, including nested collections. It does not filter rendered rows.
The correction is a separate source commit based on `1e8702a`; the unchanged
original-keyed and array diagnostics remain selectable. The corrected variant
and current runtime form the primary comparison. The source correction is commit
`78723bb`; implementation, verification and deployment status are recorded in
[feature status](../features.md).

Acceptance includes empty company, store and department collections, native and
JSON save/reload, deleting the last row, adding again and saving the new row.
Unaffected sibling IDs and parent relationships must remain unchanged.
Collection visibility follows `design.show` independently of row count. Hiding or
showing a collection preserves its data and cached structure. Hidden collections
with rows still submit those rows; explicit empty collections submit no row inputs.

The unchanged-source comparison uses identical 13-character keyed data with the
original source at `1e8702a` and the current runtime at `f4ec125`. Both use the same
company, store and department fields, native submission and stored records.
The original-keyed example connects row operations and cached binding to the
original public functions. This tests the original foundation; it does not
establish a replacement for the 13-character identity rule.

The earlier array diagnostic remains selectable for inspection. It adds hidden
sequence fields and is not the primary comparison. Its source and results remain
available until verification and review are complete.

Acceptance excludes hidden sequence fields and auxiliary identity submissions.
The current original-array example contains hidden sequence fields and therefore
does not meet this requirement. Its diagnostic results cannot establish equivalent
behavior under the accepted submission contract. All comparison artifacts remain
available for inspection.

The identity check requires zero hidden sequence controls and no submitted
`company_seq`, `store_seq` or `department_seq` fields. A separate fixture stores
IDs in the order `[5, 7, 1]`. Checks insert after 7, save a new ID, copy descendants,
reorder and reload while retaining existing IDs and parent relationships.

A separate keyed-input case gives both renderers the same keyed objects and a
specification without hidden identity fields. It checks generated native names,
server parsing, validation and document order. This case verifies the original
renderer's existing keyed-data support, independently of the array controller's
submission design. The original-keyed load, save, validate and reset endpoints
use the keyed data contract, original validator in the selected language and an independent repository.

Row-operation checks use a populated fixture for the keyed variants so
that empty rendering cannot prevent unrelated persistence checks. Separate exact
and empty checks use the fixture with an empty department collection. Explicit
empty values are not filled, filtered or replaced by the example controller.

The original-keyed binding composes the structure with the original
`composeProperties`, serializes and restores it, then binds data with the original
`buildField` and `makeTranslate`. Each keyed adapter loads a composition reference
once before mounting. Its loader rejects subsequent reads. Cache checks verify
repeated data injection, immutable template content and one loader read, rather
than requiring a particular session property. Added application binding is
identified separately from the unchanged library source.
Each frame mounts before requesting saved data from the selected server, then injects the response.

An Apple container serves React, Vue and Svelte browser builds and PHP, Go and Rust APIs.
Library snapshots come from Git archives of the specified commits. The retained original
library snapshot remains unchanged. The retained array example controller connects its
existing buttons to array insertion, deep copying, deletion and reordering. It
reads current input values, clears declared sequence fields in copied subtrees,
updates native input properties and conditions, and calls the original rendering
interface with the resulting arrays. It preserves focus and scroll positions
without remounting the form. The page
identifies this added controller. Its behavior is not described as a feature
already implemented in the original library. No 13-character keys are used in
its form data or generated input names.

Frame checks run sequentially because focus is shared by the browser page.
The original example controller cancels superseded input renders. A render must
not restore older field values or selection after a newer input event.
Each original example adapter completes `load` after its framework commits the DOM. The
controller restores input values and focus at that point without frame delays.
The same browser checks exercise all variants. They inspect actual nested input
names, current-value copying, independent descendants, ordering, data replacement,
server transmission, persistence and reload. Failures in either version remain
visible as failures. The absence of original button handlers alone is not evidence
that its data structure cannot support row operations.

Failure results distinguish added example configuration from original renderer
behavior and original API support. Hidden sequence fields belong to the array
example, not to a requirement of the original renderer. Empty rendering and exact
persistence can fail from the same blank-row behavior and are not counted as two
independent defects. Each failure displays a concise explanation and expandable
raw assertion details. Explanations do not change check outcomes or exit status.

The comparison implementations, source snapshots and running environment remain
available throughout verification. Repository cleanup follows verification and
review of its results. A completed test run does not mean all requirements passed.
The browser runner exits with status 1 for any failed check, incomplete results
or browser error. It preserves the actual results in its report.

Each server/comparison variant/framework has an independent JSON repository. Company, store and
department tables contain string sequences and zero-based positions. Child tables
contain parent sequences. Save replaces the complete hierarchy in one locked,
atomic file update. Existing IDs remain stable, new IDs increase, and deleted IDs
are not reused. A saved child ID cannot be assigned to a different parent.
Validation failure does not modify the repository. Load reconstructs arrays or
keyed objects from the stored rows and parent IDs.

The 13-character implementation uses native form submissions as its baseline.
Each frame provides a choice between native form and JSON transmission. Both
choices run the same JavaScript validation, selected server validation and repository save.
Automated checks execute each choice, including invalid submissions, saved-key
updates, deletion, empty collections and reload. Form and JSON saves of identical
valid data must produce identical records, IDs and row order.
JSON submissions with the same keyed structure require an explicit contract to
preserve document member order through parsing, editing, storage and reload.
The JSON path uses ordered-json `deb1b354` for browser requests, server requests and
responses, and repository JSON files. It does not sort row object keys. JSON
grammar does not need to change for this contract. Parsing and serialization are
separate from form generation, validation and persistence rules. The transport
modules convert `Value` nodes to the existing record data model and back. Empty
objects and arrays remain distinct until JSON shape validation completes; only
then does PHP convert object data to validator arrays. Form row keys remain
delimited strings. JavaScript rejects a conversion that would reorder object
members, and non-finite or unsafe integer numbers, instead of changing them
silently. Form field values and sequence identifiers use strings; numeric
response metadata uses finite numbers within the JavaScript safe integer range.
Editing member order in the JSON document changes the requested row order. A
check edits that order and verifies the resulting stored and rendered order.
No order fields, hidden sequence fields or alternative key encodings are added
to the keyed submission data.
Native multipart submissions contain the generated input names and a final
`_form_complete=1` marker. Each server rejects requests missing the marker. PHP also rejects
requests truncated by its input-count limit. Missing checkboxes become empty
strings and missing repeat collections become empty collections. JSON requests
use `{ "form": ... }`, with arrays for the array diagnostic and objects for both
keyed examples, including empty collections. Responses preserve each example's data
types. The page displays native fields, server parsed data, normalized values, stored
rows, loaded form data and scoped key changes.

The page displays source commits, server and framework selection and actual check results.
The environment binds a localhost port and remains running for manual review.
Operations documents describe building, starting, checking and stopping it.

Order checks use each example's transport contract. The keyed examples check
reordered native fields and JSON that retains document member order through server
persistence and reload. The array version also sorts JSON object keys recursively
before transmission and checks the reloaded array order. Standard JSON alone
does not establish the additional member-order contract. Stored record
loading uses explicit `position` values, regardless
of the physical order of records in the file. Real pointer and keyboard checks
verify focus, selection, scrolling and checkbox-controlled note visibility.

## Ordered JSON processor verification

The processor check supplies identical JSON documents to JavaScript, PHP, the PHP
extension, Go and Rust. It compares object member order at every depth, array
order, scalar values, and object/array types after parsing, serialization and
reconstruction. Cases cover numeric member names in order `5, 7, 1`, saved
13-character keys, inserted and copied rows, saved-key replacement, changed row
order, and empty collections. Submitted documents contain no auxiliary identity
or order fields.

This check verifies the JSON processor against the existing data contract. It
does not replace the example's browser and persistence checks. Runtime
integration requires both transmission choices to pass the actual form lifecycle
checks. The dependency commit and source archive hash appear with the comparison
source metadata. Implementation and deployment status are recorded in feature
status.

A four-language validation comparison succeeds only when JS, PHP, Go and Rust
each return exactly one successful execution result and all validation signatures
match. Missing, duplicate or failed engine results make the comparison fail.

## Parsed layout comparison

Layout fixtures parse HTML and CSS before comparing framework output. The parser
handles HTML attribute-name case, character references and quoted CSS values.
The comparison preserves input paths, IDs, values, SVG attributes and significant
text whitespace. It removes framework comments and inter-element formatting
whitespace. Original HTML equality remains a separate inspector check with no
normalization.
