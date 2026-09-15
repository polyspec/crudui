# CRUDUI canonical examples and form verification

[한국어](README.ko.md).

The canonical `crudui.test` entry page is the full CRUDUI feature pipeline: List → Detail → Form →
Save → List refresh. CRUDUI generates the list, detail, links and form flow; the page does not
simulate stages with external buttons. It selects JavaScript reference, PHP, PHP extension, Go or
Rust; HTML, React, Vue or Svelte; and CSR or SSR. The separate benchmark screen is `/benchmark/`;
`/displays/` is not a route.

This example verifies nested keyed forms through PHP, the PHP extension, Go and
Rust. Each server compiles, renders, validates and stores the same form data.
React, Vue, Svelte and the HTML renderer run both `bindForm` and `createForm`. Native form and
ordered JSON submissions use the same validation and persistence contract.

Repeated collections use keyed objects. Saved rows use 13 decimal digits and
new rows use 13 lowercase hexadecimal digits between `__` delimiters. Object
member order determines display and storage order. OrderedJSON processes JSON
requests, responses and repository files without converting keyed objects to
arrays.

The main page shows two initialization paths side by side: the left frame creates
the form with the saved record, and the right frame mounts a data-independent
serialized template before requesting the record and injecting it. Each column runs the same injection,
edit, save, copy, move, add, structure map and focus stages in turn, and a list at the top
compares every stage: raw HTML, DOM, attributes, control state, computed CSS,
submitted fields, data, focus and save responses.

Run the source checks from the repository root:

```sh
npm run test:form-comparison
make docs-check
```

The comparison service runs the current repository tree in one long-running
toolchain container at `https://crudui.test`. The repository is mounted read-only,
build outputs stay in container volumes, and source changes apply without building
the image again. Apply the deployment and verify the tree it runs:

```sh
node examples/form-comparison/comparison-deployment.mjs
node examples/form-comparison/verification.mjs
```

The supervisor rebuilds only the target a change affects and restarts only the
affected server. Every server, frame and report names the source identity: the
checked-out commit and a digest of the uncommitted changes.

The [verification procedure](../../docs/operations/verification.md) defines
deployment, natural application, HTTP checks, sequential browser checks and report
aggregation. The [form verification contract](../../docs/spec/form-comparison.md)
defines the toolchain image, build volumes, build targets, source identity, required
matrix, evidence and pass criteria. [Feature status](../../docs/features.md) records
verified code separately from deployment.
