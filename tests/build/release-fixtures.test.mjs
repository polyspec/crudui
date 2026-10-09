// The consumer project of the npm archives (tests/release-install/npm) names the release in its own version field, which
// kit's lock step keeps as committed. The project must name the version of package.json, so that a release that leaves it
// behind fails the check (C13.1-35).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { ROOT } from '../../scripts/kit/paths.mjs';

const read = file => JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'));

test('the npm consumer project of the release archives has the version of package.json', () => {
  assert.equal(read('tests/release-install/npm/package.json').version, read('package.json').version);
});
