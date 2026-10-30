// `make ordered-json-ext` builds the OrderedJSON php-ext of the release packages.json with PIE directly: PIE is the shim that
// install-pie installs, the repository and the build run in an empty PIE_WORK, and the one installed.json entry names the
// package folder that the local record servers read (C17.96). kit's pie-build is not used: kit main removes it (K931), to be released in 0.0.81.
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { makeDryRun } from './make-dry-run.mts';

const root = path.resolve(import.meta.dirname, '../..');

test('ordered-json-ext runs PIE directly and no pie-build of kit (C17.96)', () => {
  const run = makeDryRun(root, 'ordered-json-ext');
  assert.equal(run.status, 0, run.stderr);
  assert.doesNotMatch(run.stdout, /pie-build/, run.stdout);
  assert.match(run.stdout, /\/shims\/pie repository:add composer https:\/\/github\.com\/polyspec\/ordered-json\/releases\/download\/v0\.0\.14\/packages\.json --no-interaction/, run.stdout);
  assert.match(run.stdout, /\/shims\/pie build polyspec\/ordered-json-php-ext:0\.0\.14 --no-interaction/, run.stdout);
  assert.match(run.stdout, /PIE_WORKING_DIRECTORY=\S*var\/pie\//, run.stdout);
});
