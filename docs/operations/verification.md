# Form verification

[한국어](verification.ko.md).

Run the maintained package and form checks from the repository root:

```sh
npm run test:dependencies
npm run typecheck
make test-validators
make test-native
npm run test:forms
npm run test:form-comparison
npm run test:inspector
npm run test:packages
make conformance
make docs-check
```

Every command must return status 0 for the same source tree before tree
verification. `npm run test:dependencies` verifies package declarations and install
policy. `npm run typecheck` type-checks every TypeScript package. `make test-validators`
runs the TypeScript, PHP, Go and Rust validator suites. `make test-native` builds the PHP
extension, runs its engine, builder and API tests (`make test-php-extension`) and runs the PHP,
Go, Rust, shared protocol and generator checks, including the Chromium widget and timezone
checks. `npm run test:inspector` runs the form snapshot and browser inspector tests.
`make conformance` runs the suites again with evidence recording and checks the evidence
([conformance evidence](../spec/conformance.md)). Every test runs through the
[test runner](testing.md#test-runner). The tree verification below verifies HTTP and browser integration.
A successful repository check does not replace tree verification, and successful
tree verification does not replace the repository check.

The form inspector compares raw HTML, parsed DOM, computed styles and live
control state without modifying the inspected form. Framework initialization
tests compare initial data with later injection and record restoration.
[JSON order checks](ordered-json.md) verify the transport representation separately.

The HTTP and browser verifier is stored in this repository. It runs against the
current repository tree, committed or not, inside the long-running comparison
container at `https://crudui.test`. Apply the deployment, then verify the tree it
runs:

```sh
make deploy
make deploy-verify
```

`make deploy` runs `examples/form-comparison/comparison-deployment.mjs` and `make deploy-verify`
runs `examples/form-comparison/verification.mjs`.

The deployment command builds the toolchain image only when
`examples/form-comparison/Containerfile` changed. It mounts the repository
read-only and keeps build outputs in the `crudui-comparison-build` and
`crudui-comparison-cache` volumes. If the expected container is running with the
expected image, deployment performs source synchronization through that existing
container; it does not recreate the container, restart services or reconnect
volumes. Container creation is reserved for an absent, stopped or image-mismatched
deployment. The command preserves the active service's data and removes unused
comparison images and retired per-commit directories.

Neither command waits silently. Every step prints its start with its own timeout,
its elapsed time every 15 seconds while it runs and its duration when it finishes;
a step that reaches its timeout is stopped with its whole process tree and names
itself and its elapsed time. While containerctl waits for health, the deployment
command prints the supervisor's build targets as they run. The health check waits
six minutes, sized from the measured start of 58 seconds, not containerctl's 30
minute maximum.

A source change needs no command. The supervisor copies the changed files into the
build tree, rebuilds only the affected target and restarts only the affected server.
PHP source changes apply on the next request. A supervisor-module change reloads the
supervisor process inside the existing container and preserves all volumes.

The container runs one public server, one PHP process, one PHP extension process,
one Go process and one Rust process from the build tree. PHP uses Composer classes.
The PHP extension process loads both `ordered_json.so` and `crudui.so`.

The verification command runs inside the container as the application user with
the Chromium sandbox enabled. It waits for the current build cycle and requires it
to be ready. It then runs the checks of the deployed services: the processor modes,
which load the extensions this container built, and the generation and persistence
checks against the four running servers. It does not repeat the source suite, the
Go and Rust server tests or the ordered JSON tests, which the commands above
already ran on this host and which read no build output of the container.

The generation check requires 450 results, 899 requests and all 32
server/rendering-path/framework combinations. It checks compile, retained
serialized-template render, the built frame document, raw SSR form HTML with its
record payload, English and Korean output, rejected SSR requests, invalid data
rejection and unchanged stored records. The persistence check requires 120
results across four servers and two rendering paths.

It then runs browser verification for PHP, the PHP extension, Go and Rust at the
same time and creates the aggregate report. Each check drives its own browser
process, so the focus, selection and scroll it measures belong to that check alone,
and each server keeps its own records. The container has eight processors for them;
one check occupies about one.

The aggregate requires 1,216 successful scenario checks, 5,376 successful
initialization comparisons, 320 successful interaction
checks, 32 successful mount checks, 64 matching frame-document checks and four
successful performance results. A complete server report must stay within 900,000
milliseconds, and inside a run each report holds its own limit: 180,000
milliseconds for an initialization report, 60,000 for a scenario report. A failed,
missing, malformed or late result returns status 1. A source change during the run returns status 1. The
command also returns status 1 when any report names another source identity or when
the evidence identity differs from the checkout's identity. The command does not
retry requests or use sleep intervals.

Reports, screenshots and `verification.json`, which records the source identity,
build cycle, checks and totals, remain in `.form-comparison/deployment/results/`
until the next verification.

Package publication is a separate operation. Verification does not change
publication state.
Before applying a source change, inspect the existing container and its exact mounts. If the reuse
condition passes, leave the container and all volumes running and let the supervisor synchronize the
read-only source mount. Do not use `down` as a recovery step for a build or health failure; preserve
the state for diagnosis and retry only the failed build or process operation.
