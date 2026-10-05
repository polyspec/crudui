// The lock of the install project of test:packages (scripts/install-lock.mjs) holds the entries of the root lock that
// npm resolves for the install project, so `npm ci --offline` installs the releases of the root lock and resolves no range.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { installLock, fileIntegrity, resolveIn } from '../../scripts/install-lock.mjs';

const rootLock = {
  packages: {
    '': { name: 'root', workspaces: ['packages/*'] },
    'node_modules/@x/kit': { resolved: 'packages/kit', link: true },
    'packages/kit': { name: '@x/kit', version: '1.0.0', dependencies: { left: '^2.0.0', shared: '^1.0.0' } },
    'packages/kit/node_modules/left': { version: '2.1.0', resolved: 'https://registry.test/left-2.1.0.tgz', integrity: 'sha512-left2', dev: true },
    'node_modules/left': { version: '1.4.0', resolved: 'https://registry.test/left-1.4.0.tgz', integrity: 'sha512-left1', dev: true },
    'node_modules/shared': { version: '1.2.0', resolved: 'https://registry.test/shared.tgz', integrity: 'sha512-shared', dependencies: { deep: '^3.0.0' }, peerDependencies: { absent: '*' }, peerDependenciesMeta: { absent: { optional: true } } },
    'node_modules/shared/node_modules/deep': { version: '3.0.1', resolved: 'https://registry.test/deep.tgz', integrity: 'sha512-deep', peer: true },
    'node_modules/react': { version: '19.2.8', resolved: 'https://registry.test/react.tgz', integrity: 'sha512-react', devOptional: true },
    'node_modules/unused': { version: '9.9.9' },
  },
};

function packedKit(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'crudui-install-lock-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const tarball = path.join(directory, 'x-kit-1.0.0.tgz');
  writeFileSync(tarball, 'tarball bytes');
  return { '@x/kit': { directory: 'packages/kit', tarball, manifest: { name: '@x/kit', version: '1.0.0', dependencies: { left: '^2.0.0', shared: '^1.0.0' }, peerDependencies: { react: '>=17' } } } };
}

test('npm resolves a dependency from the own node_modules of a package, then from each parent', () => {
  assert.equal(resolveIn(rootLock.packages, 'packages/kit', 'left'), 'packages/kit/node_modules/left');
  assert.equal(resolveIn(rootLock.packages, '', 'left'), 'node_modules/left');
  assert.equal(resolveIn(rootLock.packages, 'node_modules/shared', 'deep'), 'node_modules/shared/node_modules/deep');
  assert.equal(resolveIn(rootLock.packages, 'node_modules/shared/node_modules/deep', 'shared'), 'node_modules/shared');
  assert.equal(resolveIn(rootLock.packages, '', '@x/kit'), null, 'a workspace link is no registry entry');
});

test('the install lock holds the packed tarball and the root lock entries that npm resolves for the install project', t => {
  const packed = packedKit(t);
  const tarball = packed['@x/kit'].tarball;
  const lock = installLock({ rootLock, packed, manifest: { name: 'project', version: '0.0.1', dependencies: { '@x/kit': `file:${tarball}`, react: '19.2.8' } } });
  assert.deepEqual(Object.keys(lock.packages).sort(), [
    '', 'node_modules/@x/kit', 'node_modules/@x/kit/node_modules/left', 'node_modules/react', 'node_modules/shared', 'node_modules/shared/node_modules/deep',
  ]);
  assert.deepEqual(lock.packages['node_modules/@x/kit'], {
    version: '1.0.0', resolved: `file:${tarball}`, integrity: fileIntegrity(tarball),
    dependencies: { left: '^2.0.0', shared: '^1.0.0' }, peerDependencies: { react: '>=17' },
  });
  // The nested entry of the workspace moves under the packed package; the flags of the root project are dropped.
  assert.deepEqual(lock.packages['node_modules/@x/kit/node_modules/left'], { version: '2.1.0', resolved: 'https://registry.test/left-2.1.0.tgz', integrity: 'sha512-left2' });
  assert.deepEqual(lock.packages['node_modules/react'], { version: '19.2.8', resolved: 'https://registry.test/react.tgz', integrity: 'sha512-react' });
  assert.equal(lock.packages['node_modules/shared/node_modules/deep'].peer, undefined);
  assert.deepEqual(lock.packages[''], { name: 'project', version: '0.0.1', dependencies: { '@x/kit': `file:${tarball}`, react: '19.2.8' } });
  assert.equal(lock.lockfileVersion, 3);
});

test('a dependency that the root lock does not record fails with its name and dependent', t => {
  const packed = packedKit(t);
  assert.throws(() => installLock({ rootLock, packed, manifest: { name: 'project', version: '0.0.1', dependencies: { '@x/kit': 'file:x', vue: '3.5.43' } } }),
    /the root package-lock\.json records no entry for vue of project$/);
  const { packages } = structuredClone(rootLock);
  delete packages['node_modules/react'];
  assert.throws(() => installLock({ rootLock: { packages }, packed, manifest: { name: 'project', version: '0.0.1', dependencies: { '@x/kit': 'file:x' } } }),
    /records no entry for react of @x\/kit$/);
});
