// The dependency check (scripts/check-dependencies.mjs) judges the dependencies by the review recorded in
// config/dependency-review.json, never by a registry: each case builds a checkout with npm workspaces and a Composer
// package, and a stub composer stands for `composer validate`, so no case reaches a network.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { check, findingLine } from '../../scripts/check-dependencies.mjs';
import { TAGGED_NPM_PACKAGES, digest, readState } from '../../scripts/dependency-state.mjs';
import { updatePlan } from '../../scripts/dependency-review.mjs';
import { ROOT } from '../../scripts/tracked-files.mjs';

const write = (directory, file, value) => {
  mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
  writeFileSync(path.join(directory, file), typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
};
const read = (directory, file) => JSON.parse(readFileSync(path.join(directory, file), 'utf8'));
const exception = (manifest, name) => ({
  ecosystem: 'npm', manifest, package: name, reason: 'a reproduced incompatibility', removalCondition: 'when it is fixed', verification: ['npm test'],
});

/** A reviewed checkout: a root and one workspace with registry, local, URL and peer dependencies, and a Composer package. */
function checkout(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'crudui-dependency-review-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // The Cargo locks are the Cargo.lock files of the checkout that Git does not ignore.
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  write(root, '.gitignore', '/target/\n');
  write(root, 'rust/Cargo.lock', 'version = 4\n');
  write(root, 'target/copy/Cargo.lock', 'version = 4\n');
  write(root, 'package.json', {
    name: 'fixture', workspaces: ['packages/*'],
    dependencies: { left: '^1.0.0' },
    devDependencies: { '@scope/kit': '0.0.1', remote: 'https://example.test/remote/tar.gz/0123456789abcdef0123456789abcdef01234567' },
    peerDependencies: { peer: '^9.0.0' },
  });
  write(root, 'packages/kit/package.json', {
    name: '@scope/kit', version: '0.0.1', devDependencies: { left: '^2.0.0', right: '3.0.0' }, peerDependencies: { peer: '^9.0.0' },
  });
  write(root, 'package-lock.json', {
    lockfileVersion: 3,
    packages: {
      '': { name: 'fixture', workspaces: ['packages/*'], dependencies: { left: '^1.0.0' }, devDependencies: { '@scope/kit': '0.0.1', remote: 'https://example.test/remote/tar.gz/0123456789abcdef0123456789abcdef01234567' }, peerDependencies: { peer: '^9.0.0' } },
      'node_modules/@scope/kit': { resolved: 'packages/kit', link: true },
      'node_modules/left': { version: '1.4.0' },
      'node_modules/remote': { version: '0.1.0', resolved: 'https://example.test/remote/tar.gz/0123456789abcdef0123456789abcdef01234567' },
      'node_modules/right': { version: '3.0.0' },
      'node_modules/peer': { version: '9.1.0' },
      'packages/kit': { name: '@scope/kit', version: '0.0.1', devDependencies: { left: '^2.0.0', right: '3.0.0' }, peerDependencies: { peer: '^9.0.0' } },
      'packages/kit/node_modules/left': { version: '2.1.0' },
    },
  });
  write(root, 'php/composer.json', { name: 'fixture/php', require: { php: '^8.4', 'ext-mbstring': '*', 'fixture/local': '0.0.1' }, 'require-dev': { 'vendor/unit': '^13.0' } });
  write(root, 'php/composer.lock', { packages: [{ name: 'fixture/local', version: '0.0.1', dist: { type: 'path', url: '../local' } }], 'packages-dev': [{ name: 'vendor/unit', version: '13.4.1' }] });
  write(root, 'composer', '#!/bin/sh\nexit 0\n');
  chmodSync(path.join(root, 'composer'), 0o755);
  write(root, 'config/dependency-policy.json', { schema: 1, composerManifests: ['php/composer.json'], exceptions: [] });
  write(root, 'config/dependency-review.json', {
    schema: 1, reviewed: '2026-10-05T00:00:00.000Z',
    locks: ['package-lock.json', 'php/composer.lock', 'rust/Cargo.lock'].map(lock => ({ lock, sha256: digest(root, lock), advisories: [] })),
    dependencies: [
      { ecosystem: 'npm', manifest: 'package.json', package: 'left', version: '1.4.0', latest: '1.4.0' },
      { ecosystem: 'npm', manifest: 'packages/kit/package.json', package: 'left', version: '2.1.0', latest: '2.1.0' },
      { ecosystem: 'npm', manifest: 'packages/kit/package.json', package: 'right', version: '3.0.0', latest: '3.0.0' },
      { ecosystem: 'composer', manifest: 'php/composer.json', package: 'vendor/unit', version: '13.4.1', latest: '13.4.1' },
    ],
  });
  return root;
}

const findings = root => check(root, { composer: path.join(root, 'composer') }).map(({ rule, subject }) => `${rule} ${subject}`);

/** Rewrites a JSON file of the checkout; a lock keeps its review entry current unless `review` is false. */
function edit(root, file, change, { review = true } = {}) {
  const value = read(root, file);
  change(value);
  write(root, file, value);
  if (review && /lock/.test(file)) {
    const record = read(root, 'config/dependency-review.json');
    for (const entry of record.locks) entry.sha256 = digest(root, entry.lock);
    write(root, 'config/dependency-review.json', record);
  }
}

test('the registry dependencies are the dependencies and devDependencies of every npm manifest and the Composer requirements', t => {
  const root = checkout(t);
  const state = readState(root, read(root, 'config/dependency-policy.json'));
  assert.deepEqual(state.dependencies.map(item => `${item.manifest} ${item.package} ${item.version}`), [
    'package.json left 1.4.0', 'packages/kit/package.json left 2.1.0', 'packages/kit/package.json right 3.0.0', 'php/composer.json vendor/unit 13.4.1',
  ]);
  // Peer, URL and local dependencies and platform requirements are not registry dependencies.
  assert.deepEqual(state.local.map(item => `${item.manifest} ${item.package}`), ['package.json @scope/kit', 'php/composer.json fixture/local']);
  assert.deepEqual(state.locks, ['package-lock.json', 'php/composer.lock', 'rust/Cargo.lock']);
  assert.deepEqual(findings(root), []);
});

test('a lock changed after its review and a dependency without a review entry fail with the review command', t => {
  const root = checkout(t);
  edit(root, 'package-lock.json', lock => { lock.packages['packages/kit/node_modules/left'].version = '2.2.0'; }, { review: false });
  edit(root, 'php/composer.json', manifest => { manifest['require-dev']['vendor/extra'] = '^1.0'; });
  const lines = check(root, { composer: path.join(root, 'composer') }).map(findingLine);
  assert.deepEqual(lines.map(line => line.split(':')[0]), [
    '[dependencies] package-lock.json', '[dependencies] packages/kit/package.json left', '[dependencies] php/composer.json vendor/extra',
  ]);
  assert.match(lines[0], /the lock changed after the review of 2026-10-05T00:00:00.000Z: its sha256 is [0-9a-f]{64}, the review recorded [0-9a-f]{64}\. Rule: .*\. Fix: make dependency-review RECORD=1\.$/);
  assert.match(lines[1], /the lock holds 2\.2\.0, the review of 2026-10-05T00:00:00.000Z recorded 2\.1\.0/);
  assert.match(lines[2], /the registry dependency has no entry in the review record/);
});

test('a dependency below the latest stable release of its review needs an exception, and an exception at the latest release is stale', t => {
  const root = checkout(t);
  edit(root, 'config/dependency-review.json', record => { record.dependencies[1].latest = '3.0.0'; });
  assert.deepEqual(findings(root), ['latest packages/kit/package.json left']);
  assert.match(findingLine(check(root, { composer: path.join(root, 'composer') })[0]), /2\.1\.0 is older than 3\.0\.0, the latest stable release at the review of 2026-10-05T00:00:00\.000Z, and config\/dependency-policy\.json holds no exception for it\. Rule: .*\. Fix: make dependency-review UPDATE=1, or add an exception/);
  // The exception names the manifest: the root left at its latest release is not excepted by it.
  edit(root, 'config/dependency-policy.json', policy => { policy.exceptions.push(exception('packages/kit/package.json', 'left')); });
  assert.deepEqual(findings(root), []);
  edit(root, 'config/dependency-review.json', record => { record.dependencies[1].latest = '2.1.0'; });
  assert.deepEqual(findings(root), ['stale packages/kit/package.json left']);
});

test('an exception needs a reason, a removal condition and verification and names a registry dependency of its manifest', t => {
  const root = checkout(t);
  edit(root, 'config/dependency-review.json', record => { record.dependencies[0].latest = '1.5.0'; });
  edit(root, 'config/dependency-policy.json', policy => {
    policy.exceptions.push({ ...exception('package.json', 'left'), removalCondition: ' ' });
    policy.exceptions.push(exception('package.json', 'peer'), exception('package.json', 'remote'), exception('package.json', '@scope/kit'));
  });
  assert.deepEqual(findings(root), ['policy npm:package.json:left', 'policy npm:package.json:peer', 'policy npm:package.json:remote', 'policy npm:package.json:@scope/kit']);
});

test('an advisory recorded at the review of a lock fails until an update records a review without it', t => {
  const root = checkout(t);
  write(root, 'rust/Cargo.lock', 'version = 4\n# changed\n');
  write(root, 'tools/Cargo.lock', 'version = 4\n');
  assert.deepEqual(findings(root), ['record rust/Cargo.lock', 'record tools/Cargo.lock']);
  write(root, 'rust/Cargo.lock', 'version = 4\n');
  rmSync(path.join(root, 'tools'), { recursive: true });
  edit(root, 'config/dependency-review.json', record => {
    record.locks[1].advisories.push({ package: 'vendor/unit', version: '13.4.1', id: 'PKSA-0000', severity: 'high', title: 'a known advisory', url: 'https://example.test/advisory' });
  });
  edit(root, 'config/dependency-review.json', record => {
    record.locks[2].advisories.push({ package: 'crate', version: '1.0.0', id: 'RUSTSEC-2026-0001', severity: 'unmaintained', title: 'crate is unmaintained', url: 'https://rustsec.org/advisories/RUSTSEC-2026-0001' });
  });
  assert.deepEqual(findings(root), ['advisory php/composer.lock vendor/unit 13.4.1', 'advisory rust/Cargo.lock crate 1.0.0']);
  assert.match(findingLine(check(root, { composer: path.join(root, 'composer') })[0]), /found advisory PKSA-0000 \(high\) a known advisory https:\/\/example\.test\/advisory\. Rule: .*\. Fix: make dependency-review UPDATE=1/);
});

test('the npm lock records every manifest, a package of this repository is required at its version, and a Composer lock is current', t => {
  const root = checkout(t);
  edit(root, 'packages/kit/package.json', manifest => { manifest.devDependencies.right = '3.0.1'; manifest.version = '0.0.2'; });
  write(root, 'composer', '#!/bin/sh\necho "The lock file is not up to date with the latest changes in composer.json." >&2\nexit 2\n');
  assert.deepEqual(findings(root), [
    'composerLock php/composer.json',
    'local package.json @scope/kit',
    'npmLock package-lock.json packages/kit devDependencies right',
  ]);
  assert.match(findingLine(check(root, { composer: path.join(root, 'composer') })[0]), /composer validate --strict failed: The lock file is not up to date .*Fix: run composer update --lock in php\.$/);
});

test('a package taken from a GitHub tag is linked to the checkout of its tag at the version of that tag', t => {
  const root = checkout(t);
  const [{ directory, version }] = TAGGED_NPM_PACKAGES;
  write(root, `${directory}/package.json`, { name: '@polyspec/ordered-json', version });
  edit(root, 'package.json', manifest => { manifest.devDependencies['@polyspec/ordered-json'] = `file:${directory}`; });
  edit(root, 'package-lock.json', lock => {
    lock.packages[''].devDependencies['@polyspec/ordered-json'] = `file:${directory}`;
    lock.packages['node_modules/@polyspec/ordered-json'] = { resolved: directory, link: true };
    lock.packages[directory] = { name: '@polyspec/ordered-json', version, dev: true };
  });
  const state = readState(root, read(root, 'config/dependency-policy.json'));
  // A tagged package is neither a registry dependency nor a package of this repository.
  assert.deepEqual(state.tagged.map(item => `${item.manifest} ${item.package}`), ['package.json @polyspec/ordered-json']);
  assert.deepEqual(state.local.map(item => `${item.manifest} ${item.package}`), ['package.json @scope/kit', 'php/composer.json fixture/local']);
  assert.equal(state.dependencies.some(item => item.package === '@polyspec/ordered-json'), false);
  assert.deepEqual(findings(root), []);

  write(root, `${directory}/package.json`, { name: '@polyspec/ordered-json', version: '9.9.9' });
  assert.deepEqual(findings(root), ['tagged package.json @polyspec/ordered-json']);
  assert.match(findingLine(check(root, { composer: path.join(root, 'composer') })[0]),
    new RegExp(`has version 9\\.9\\.9, the tag v${version.replaceAll('.', '\\.')} has version ${version.replaceAll('.', '\\.')}\\..*Fix: make install-ordered-json\\.$`));
  write(root, `${directory}/package.json`, { name: '@polyspec/ordered-json', version });
  edit(root, 'package-lock.json', lock => { lock.packages[directory].version = '9.9.9'; });
  assert.deepEqual(findings(root), ['tagged package.json @polyspec/ordered-json']);
  edit(root, 'package-lock.json', lock => {
    lock.packages[directory].version = version;
    lock.packages['node_modules/@polyspec/ordered-json'].resolved = 'elsewhere/js';
  });
  assert.deepEqual(findings(root), ['tagged package.json @polyspec/ordered-json']);
});

test('the review plan raises a workspace dependency in its workspace and keeps the range operator', () => {
  const plan = updatePlan({
    newer: [
      { ecosystem: 'npm', manifest: 'packages/kit/package.json', package: 'left', kind: 'devDependencies', spec: '^2.0.0', latest: '3.0.0' },
      { ecosystem: 'npm', manifest: 'package.json', package: 'right', kind: 'dependencies', spec: '3.0.0', latest: '3.1.0' },
      { ecosystem: 'composer', manifest: 'php/composer.json', package: 'vendor/unit', kind: 'require-dev', spec: '^13.0', latest: '14.0.0' },
    ],
    advisories: [{ lock: 'php/composer.lock', package: 'vendor/unit' }, { lock: 'rust/Cargo.lock', package: 'crate' }, { lock: 'rust/Cargo.lock', package: 'other' }],
  });
  assert.deepEqual(plan.map(step => `${step.cwd}: ${step.command} ${step.args.join(' ')}`), [
    '.: npm install --workspace packages/kit --save-dev left@^3.0.0',
    '.: npm install --save --save-exact right@3.1.0',
    'php: composer require --dev --update-with-dependencies --no-interaction vendor/unit:^14.0.0',
    'php: composer update --with-dependencies --no-interaction vendor/unit',
    'rust: cargo update -p crate -p other',
  ]);
});

test('the checks of test:dependencies run no registry query', () => {
  const manifest = read(ROOT, 'package.json');
  const files = manifest.scripts['test:dependencies'].match(/\S+\.test\.mjs/g);
  assert.deepEqual(files, ['tests/build/dependency-health.test.mjs', 'tests/build/dependency-review.test.mjs']);
  for (const file of [...files, 'scripts/check-dependencies.mjs', 'scripts/dependency-state.mjs']) {
    const source = readFileSync(path.join(ROOT, file), 'utf8');
    assert.doesNotMatch(source, /['"](?:audit|outdated|view)['"]/, `${file} must not ask a registry`);
  }
});
