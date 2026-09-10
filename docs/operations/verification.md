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

The HTTP and browser verifier is stored in this repository. Prepare a candidate
from a clean current commit, build the image and start an isolated container:

```sh
CANDIDATE_ROOT=$(pwd)
CANDIDATE_REF=$(git rev-parse HEAD)
CANDIDATE_TAG=$(printf '%s' "$CANDIDATE_REF" | cut -c1-12)
CANDIDATE_DIR="$CANDIDATE_ROOT/.form-comparison/candidates/$CANDIDATE_REF"
CANDIDATE_IMAGE="localhost/crudui-form-comparison:$CANDIDATE_TAG"
CANDIDATE_NAME="crudui-form-comparison-$CANDIDATE_TAG"
node examples/form-comparison/prepare.mjs --ref "$CANDIDATE_REF"
container build --tag "$CANDIDATE_IMAGE" --progress plain "$CANDIDATE_DIR/context"
container run --detach --name "$CANDIDATE_NAME" \
  --publish 127.0.0.1:18080:8080 \
  --mount "type=bind,source=$CANDIDATE_DIR/data,target=/data" \
  --mount "type=bind,source=$CANDIDATE_DIR/results,target=/results" \
  "$CANDIDATE_IMAGE"
for attempt in $(seq 1 120); do
  curl --fail --silent http://127.0.0.1:18080/api/health >/dev/null && break
  if [ "$attempt" -eq 120 ]; then
    container logs "$CANDIDATE_NAME"
    exit 1
  fi
  sleep 1
done
```

Preparation rejects tracked or untracked changes and archives `CANDIDATE_REF`.
The candidate data and results directories are separate from deployed data. The
container starts one PHP process, one PHP extension process, one Go process and
one Rust process from the same source archive. PHP uses Composer classes. The PHP
extension process loads both `ordered_json.so` and `crudui.so`.
Image construction runs the browser-independent source and library checks. The
container runs the complete suite as the application user with the Chromium
sandbox enabled before it starts the four servers. The readiness loop fails and
prints the container log when those checks or server startup fail.

Run the processor-mode, generation, persistence and JSON checks inside the
candidate container:

```sh
container exec "$CANDIDATE_NAME" node /workspace/source/examples/form-comparison/test-php-modes.mjs /opt/ordered_json.so /opt/crudui.so /workspace/source
container exec "$CANDIDATE_NAME" node /workspace/source/examples/form-comparison/check-generation.mjs --url http://127.0.0.1:8080 --library /workspace/source --report /results/generation.json
container exec "$CANDIDATE_NAME" node /workspace/source/examples/form-comparison/check-servers.mjs
container exec "$CANDIDATE_NAME" node --test /workspace/source/examples/form-comparison/src/json.test.mjs
```

The generation check requires 290 results, 411 requests and all 24
server/rendering-path/framework combinations. It checks compile, retained
serialized-template render, raw SSR HTML, English and Korean output, invalid data
rejection and unchanged stored records. The persistence check requires 120
results across four servers and two rendering paths.

Run browser verification once per server. Do not run these commands in parallel;
the checks measure focus, selection and scroll in one browser environment.

```sh
FORM_COMPARISON_RESULTS="$CANDIDATE_DIR/results" node examples/form-comparison/check.mjs php http://127.0.0.1:18080
FORM_COMPARISON_RESULTS="$CANDIDATE_DIR/results" node examples/form-comparison/check.mjs php-ext http://127.0.0.1:18080
FORM_COMPARISON_RESULTS="$CANDIDATE_DIR/results" node examples/form-comparison/check.mjs go http://127.0.0.1:18080
FORM_COMPARISON_RESULTS="$CANDIDATE_DIR/results" node examples/form-comparison/check.mjs rust http://127.0.0.1:18080
node examples/form-comparison/check-browser-reports.mjs \
  --results "$CANDIDATE_DIR/results" \
  --origin http://127.0.0.1:18080 \
  --metadata "$CANDIDATE_DIR/context/metadata.json" \
  --report "$CANDIDATE_DIR/results/browser-summary.json"
```

The aggregate requires 960 successful scenario checks, 240 successful interaction
checks, 24 successful mount checks, 24 matching static-document checks and four
successful performance results. Each server has a 900,000 millisecond absolute
limit and a 300,000 millisecond no-progress limit. A failed, missing, malformed or
late result keeps status 1. Do not deploy a candidate unless every repository and
candidate command returns status 0 and the aggregate records `passed: true`.

Stop and remove the isolated candidate container after retaining its reports:

```sh
container stop "$CANDIDATE_NAME"
container delete "$CANDIDATE_NAME"
```

Deployment and package publication are separate operations. Candidate verification
does not change either state.
