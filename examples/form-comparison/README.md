# CRUDUI form verification

[한국어](README.ko.md).

This example verifies nested keyed forms through PHP, the PHP extension, Go and
Rust. Each server compiles, renders, validates and stores the same form data.
React, Vue and Svelte run both `bindForm` and `createForm`. Native form and
ordered JSON submissions use the same validation and persistence contract.

Repeated collections use keyed objects. Saved rows use 13 decimal digits and
new rows use 13 lowercase hexadecimal digits between `__` delimiters. Object
member order determines display and storage order. OrderedJSON processes JSON
requests, responses and repository files without converting keyed objects to
arrays.

The browser mounts a data-independent serialized template before requesting
saved data. It then injects data, edits rows and verifies repeated injection.
Initialization evidence retains raw HTML, DOM structure, attributes, control
state, computed CSS, focus, selection, submitted data and stored records.

Run the source checks from the repository root:

```sh
npm run test:form-comparison
make docs-check
```

Prepare one immutable candidate from the clean current commit and build its
image:

```sh
CANDIDATE_REF=$(git rev-parse HEAD)
CANDIDATE_IMAGE=localhost/crudui-form-comparison:$(printf '%s' "$CANDIDATE_REF" | cut -c1-12)
node examples/form-comparison/prepare.mjs --ref "$CANDIDATE_REF"
container build --tag "$CANDIDATE_IMAGE" --progress plain \
  ".form-comparison/candidates/$CANDIDATE_REF/context"
```

Preparation rejects tracked or untracked changes. The candidate context records
the source commit and archive digest together with the pinned OrderedJSON common
commit and five implementation commits. Building a candidate does not change a
running service.

The [verification procedure](../../docs/operations/verification.md) defines
candidate startup, HTTP checks, sequential browser checks and report aggregation.
The [form verification contract](../../docs/spec/form-comparison.md) defines the
required matrix, evidence and pass criteria. [Feature status](../../docs/features.md)
records verified code separately from deployment.
