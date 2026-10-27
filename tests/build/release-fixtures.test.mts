// The consumer project of the npm archives (tests/release-install/npm) names the release in its own version field, which
// kit's lock step keeps as committed. The project must name the version of package.json, so that a release that leaves it
// behind fails the check (C13.1-35).
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { readJson } from '../json.mts';
import { makeTargets } from '../../scripts/test-commands.mts';
import { makeDryRun } from './make-dry-run.mts';

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

test('release and candidate archives prepare caches before current package builds (C18.10-17, C18.10-19)', () => {
  const database = makeDryRun(ROOT, 'help', { database: true });
  assert.equal(database.status, 0, database.stderr);
  const targets = makeTargets(database.stdout);
  const notParallel = database.stdout.split('\n').find(line => line.startsWith('.NOTPARALLEL:'));
  assert.ok(notParallel, 'archive preparation requires native Make serialization');
  const serialized = notParallel.slice('.NOTPARALLEL:'.length).trim().split(/\s+/);
  for (const target of ['release-assets', 'release-candidate-assets']) {
    assert.deepEqual(targets[target]?.prerequisites, ['crudui-prepare-release-build', 'build'], target);
    assert.ok(serialized.includes(target), `${target}: native preparation must complete before the build`);
  }
  assert.deepEqual(targets['crudui-prepare-release-build']?.prerequisites,
    ['crudui-install-crates', 'crudui-install-go-modules']);
});

test('extension parity prepares the native module before its bindings run (C18.10-24)', () => {
  const database = makeDryRun(ROOT, 'help', { database: true });
  assert.equal(database.status, 0, database.stderr);
  const targets = makeTargets(database.stdout);
  assert.ok(targets['parity-check']?.prerequisites.includes('build-php-ext'), 'extension parity requires the native module before loading bindings');
});
