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

Historical browser and HTTP comparisons use an independent external checkout.
Provide its absolute path explicitly; it must contain the preserved comparison
application, pinned source commits and its own build instructions. Build its
image using that guide, then apply the Compose configuration:

```sh
COMPARISON_WORKSPACE=/absolute/path/to/preserved-comparison
cd "$COMPARISON_WORKSPACE"
containerctl up
```

The preserved workspace includes its operation guide at
`docs/operations/form-comparison.md`. Follow that guide to run PHP, PHP extension,
Go and Rust against React, Vue and Svelte using both form and JSON transmission.
Its reports retain individual failures and source metadata. A successful current
implementation does not change the result of a historical implementation.
External results do not verify subsequent source changes automatically.

`containerctl up` returns after startup health checks and HTTPS route updates.
Apply the same configuration again and compare container inspection, proxy state,
certificates, storage hashes and HTTP responses to check environment idempotence.
Record this separately from form data-injection equivalence.
