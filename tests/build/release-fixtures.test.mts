// The consumer project of the npm archives (tests/release-install/npm) names the release in its own version field, which
// kit's lock step keeps as committed. The project must name the version of package.json, so that a release that leaves it
// behind fails the check (C13.1-35).
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { readJson } from '../json.mts';

const ROOT = path.resolve(import.meta.dirname, '../..');


const read = (file: string): { version: string } => readJson(path.join(ROOT, file), { properties: { version: { type: 'string' } }, additionalProperties: true });

/** The published package names and npm smoke commands declared by the release configuration. */
interface ReleaseConsumers {
  packages: { kind: string; name: string }[];
  consumers: { npm: { smoke: Record<string, string[]> } };
}

test('the npm consumer project of the release archives has the version of package.json', () => {
  assert.equal(read('tests/release-install/npm/package.json').version, read('package.json').version);
});

test('the release consumer smoke covers every published npm package', () => {
  const release = readJson<ReleaseConsumers>(path.join(ROOT, 'config/release.json'), {
    properties: {
      packages: { elements: { properties: { kind: { type: 'string' }, name: { type: 'string' } }, additionalProperties: true } },
      consumers: { properties: { npm: { properties: { smoke: { values: { elements: { type: 'string' } } } }, additionalProperties: true } }, additionalProperties: true },
    },
    additionalProperties: true,
  });
  const expected = release.packages.filter(item => item.kind === 'npm').map(item => item.name).sort();
  assert.ok(expected.length > 0, 'config/release.json declares no published npm package');
  assert.deepEqual(Object.keys(release.consumers.npm.smoke).sort(), expected);
});
