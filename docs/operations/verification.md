# Form verification

[한국어](verification.ko.md).

Run the maintained package and form checks from the repository root:

```sh
npm run test:dependencies
make test-native
npm run test:forms
npm run test:form-comparison
node --test tests/form-inspector/form-snapshot.test.mjs
node tests/form-inspector/browser.mjs
npm run test:packages
make docs-check
```

Every command must return status 0 for the same committed source before candidate
preparation. `npm run test:dependencies` verifies package declarations and install
policy. `make test-native` builds and loads the PHP extension and runs the PHP, Go,
Rust, shared protocol and generator checks, including the Chromium widget and
timezone checks. The candidate checks below verify HTTP and browser integration. A
successful repository check does not replace candidate verification, and successful
candidate verification does not replace the repository check.

The form inspector compares raw HTML, parsed DOM, computed styles and live
control state without modifying the inspected form. Framework initialization
tests compare initial data with later injection and record restoration.
[JSON order checks](ordered-json.md) verify the transport representation separately.

The HTTP and browser verifier is stored in this repository. Verify one clean
current commit with the complete candidate lifecycle command:

```sh
CANDIDATE_REF=$(git rev-parse HEAD)
node examples/form-comparison/candidate-verification.mjs --ref "$CANDIDATE_REF"
```

Preparation rejects tracked or untracked changes and archives `CANDIDATE_REF`.
The command removes previous candidate resources without changing deployment
resources, builds the commit-specific image and creates an isolated container.
Candidate data and results directories are separate from deployed data. The
command subscribes to the candidate readiness file before it starts the attached
container process. It accepts the declared readiness file event or fails when the
container exits first. It does not retry status requests or use sleep intervals.

The container starts one PHP process, one PHP extension process, one Go process
and one Rust process from the same source archive. PHP uses Composer classes. The
PHP extension process loads both `ordered_json.so` and `crudui.so`. Image
construction runs the browser-independent source and library checks. The
container runs the complete suite as the application user with the Chromium
sandbox enabled before it starts the four servers. A failed check or server start
prints the container log and returns status 1.

After readiness, the lifecycle command runs the processor-mode, generation,
persistence and JSON checks inside the candidate container.

The generation check requires 290 results, 411 requests and all 24
server/rendering-path/framework combinations. It checks compile, retained
serialized-template render, raw SSR HTML, English and Korean output, invalid data
rejection and unchanged stored records. The persistence check requires 120
results across four servers and two rendering paths.

It then runs browser verification once per server in PHP, PHP extension, Go and
Rust order and creates the aggregate report. These checks are sequential because
they measure focus, selection and scroll in one browser environment.

The aggregate requires 912 successful scenario checks, 4,608 successful
initialization comparisons, 240 successful interaction
checks, 24 successful mount checks, 24 matching static-document checks and four
successful performance results. Each server has a 900,000 millisecond absolute
limit and a 300,000 millisecond no-progress limit. A failed, missing, malformed or
late result keeps status 1. Do not deploy a candidate unless every repository and
candidate command returns status 0 and the aggregate records `passed: true`.
Successful verification retains the exact image and compact evidence for
deployment. Failed verification reports the error and container log, removes the
failed candidate resources and returns status 1.

Deploy the verified current commit after every repository and candidate command
has returned status 0:

```sh
node examples/form-comparison/comparison-deployment.mjs --commit "$CANDIDATE_REF"
```

The deployment command verifies the candidate metadata, generation report,
persistence report, browser aggregate, exact image tag and image digest before
creating `.form-comparison/deployment/compose.yaml`. It preserves the active
service's data in the repository deployment directory without overwriting
different files. It applies the Compose file with containerctl, uses the explicit
containerctl CA to verify `https://crudui.test`, and checks the deployed source
commit, route, certificate, data mount, stored files and response bytes. It
applies the same Compose file a second time and fails if any checked state
changes.

After successful verification, the command removes every candidate container,
candidate directory, raw report, screenshot and local comparison image except
the deployed image. It also removes results from the previous deployment. The
deployment data, Compose file, candidate totals, image digest and identical-apply
verification remain under `.form-comparison/deployment/`. A failed deployment
keeps the current candidate directory for diagnosis and does not remove the
active deployment image.

Package publication is a separate operation. Candidate verification alone does
not change deployment or publication state.
