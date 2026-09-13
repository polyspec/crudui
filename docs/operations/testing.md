# Test execution

[한국어](testing.ko.md).

Run from the repository root. Install Node dependencies with
`npm ci --strict-allow-scripts`, install the PHP package's Composer dependencies,
and make PHP, Go and Cargo available on `PATH`. Build JavaScript packages before
checking their compiled exports.

```sh
composer --working-dir=packages/validator-php install
npm run build
npm test --workspace @crudui/validator -- --run
composer --working-dir=packages/validator-php test
go -C packages/validator-go test ./...
cargo test --locked --manifest-path packages/validator-rust/Cargo.toml
npm test --workspace @crudui/cli
npm run test:forms
npm run test:packages
make docs-check
```

Validator package suites cover their current and legacy cases. Current conformance
checks use the shared fixtures described in the [fixture contract](../spec/test-fixtures.md).
Compare the expected validation result or complete failure record, not only
agreement between implementations. Package checks verify exported files, declarations,
consumer compilation and production rendering.

## Legacy comparison

Root `npm test` runs `tests/runner/compare-all.js` against `tests/cases/*.json`.
It is a legacy comparison, not the current API conformance suite. JavaScript loads
the explicit compiled legacy entry; PHP uses the legacy stdin worker. Go and Rust
legacy executables are rebuilt before their selected comparisons.

```sh
npm run build
npm test
node --test tests/runner/compare-all.test.cjs
node tests/runner/compare-all.js --js-only --file required.json
```

Every selected implementation must execute, match each expected result and agree
with the others. A subprocess failure, unreadable suite or differing expectation
fails the command. A single-language run checks expectations but does not establish
cross-language agreement. Regression tests verify that process failures and
incorrect successful responses cannot pass the runner.

## Forms and reports

Use the [form verification procedure](verification.md) for raw HTML, DOM, styles,
control state, repeated injection and browser interactions. JSON order and HTTP
save/load checks are separate from validator package tests.

Record the revision, commands, results and deployment status in
[feature status](../features.md). A test result applies to the code and inputs
actually executed. Test counts alone do not establish coverage or deployment.
