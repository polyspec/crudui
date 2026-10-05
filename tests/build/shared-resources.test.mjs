import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { acquireHolderLock } from '../../scripts/holder-lock.mjs';
import { packReport } from '../../scripts/package-install-pack.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

/** The recipe lines of one Makefile target, up to the next target. */
function recipe(target) {
  const lines = read('Makefile').split('\n');
  const start = lines.findIndex(line => line.startsWith(`${target}:`));
  assert.ok(start >= 0, `Makefile has no target ${target}`);
  const end = lines.findIndex((line, index) => index > start && /^[A-Za-z0-9_.-]+:/.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
}

test('no Makefile recipe writes to a fixed path under /tmp', () => {
  const fixed = read('Makefile').split('\n').map((line, index) => `Makefile:${index + 1}: ${line.trim()}`)
    .filter(line => /(?:^|[\s'"=(])\/tmp\/[A-Za-z0-9]/.test(line));
  assert.deepEqual(fixed, [], 'Two runs would share these paths; create a directory per run with mktemp');
});

test('docs-verify-idempotent compares the two runs in a directory of its own run', () => {
  const lines = recipe('docs-verify-idempotent');
  assert.match(lines, /mktemp -d/);
  assert.match(lines, /trap 'rm -rf "\$\$runs"' EXIT/);
});

/** A `docker` stub that records its arguments and reports the image as absent. */
function containerStub(directory) {
  const bin = path.join(directory, 'bin');
  fs.mkdirSync(bin);
  const log = path.join(directory, 'calls.log');
  fs.writeFileSync(path.join(bin, 'docker'), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\n`
    + 'if [ "$1 $2" = "image inspect" ]; then exit 1; fi\n', { mode: 0o755 });
  return { log, calls: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : []),
    environment: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CRUDUI_CONTAINER: 'docker', HOME: directory } };
}

function runStyles(args, environment) {
  return spawnSync('sh', [path.join(root, 'scripts/test-form-styles-linux.sh'), ...args],
    { cwd: root, env: environment, encoding: 'utf8' });
}

const playwrightVersion = JSON.parse(read('node_modules/playwright/package.json')).version;
const imageLock = home => path.join(home, `.local/state/crudui/locks/playwright-v${playwrightVersion}-noble.lock`);
const image = `mcr.microsoft.com/playwright:v${playwrightVersion}-noble`;

test('the Linux style check keeps the image that its run pulled', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'crudui-styles-image-'));
  try {
    const stub = containerStub(directory);
    const result = runStyles([], stub.environment);
    assert.equal(result.status, 0, result.stderr);
    const calls = stub.calls();
    assert.ok(calls.some(call => call.startsWith('run ')), calls.join('\n'));
    assert.deepEqual(calls.filter(call => /^image (?:rm|delete)\b/.test(call)), []);
    assert.match(result.stderr, new RegExp(`lock: acquired ${imageLock(directory)}`));
    assert.equal(fs.existsSync(imageLock(directory)), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('the Linux style check and the image removal refuse while another run holds the image', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'crudui-styles-image-'));
  try {
    const stub = containerStub(directory);
    const lock = acquireHolderLock(imageLock(directory), { command: 'make test-form-styles-linux' });
    for (const args of [[], ['--remove-image']]) {
      const result = runStyles(args, stub.environment);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, new RegExp(`is held by pid ${process.pid} \\(process started `));
    }
    assert.deepEqual(stub.calls().filter(call => !call.startsWith('image inspect')), []);
    lock.release();
    const removal = runStyles(['--remove-image'], stub.environment);
    assert.equal(removal.status, 0, removal.stderr);
    assert.deepEqual(stub.calls().filter(call => call.startsWith('image rm')), [`image rm ${image}`]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const builtPackages = ['validator-ts', 'generator-core', 'generator-html', 'generator-react', 'generator-vue',
  'generator-svelte', 'form-binding'];

test('every package build runs under the lock of its dist directory', () => {
  for (const folder of builtPackages) {
    const build = JSON.parse(read(`packages/${folder}/package.json`)).scripts.build;
    assert.match(build, /^node \.\.\/\.\.\/scripts\/package-dist\.mjs build '[^']+'$/, folder);
  }
});

/**
 * A checkout of its own in a temporary directory: the dist and lock scripts and one package whose
 * build writes `dist/index.js`, so the test reads no build output of this checkout.
 */
function fixtureCheckout() {
  const checkout = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'crudui-dist-lock-'));
  fs.mkdirSync(path.join(checkout, 'scripts'));
  for (const script of ['package-dist.mjs', 'holder-lock.mjs', 'checkout-npm.mjs']) {
    fs.copyFileSync(path.join(root, 'scripts', script), path.join(checkout, 'scripts', script));
  }
  const packageDirectory = path.join(checkout, 'packages', 'fixture');
  fs.mkdirSync(packageDirectory, { recursive: true });
  fs.writeFileSync(path.join(packageDirectory, 'package.json'), `${JSON.stringify({
    name: '@crudui/dist-lock-fixture', version: '0.0.0', private: true, type: 'module', files: ['dist'],
    scripts: { build: "node ../../scripts/package-dist.mjs build 'node build.mjs'" },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(packageDirectory, 'build.mjs'), [
    "import fs from 'node:fs';",
    "fs.rmSync('dist', { recursive: true, force: true });",
    "fs.mkdirSync('dist');",
    "fs.writeFileSync('dist/index.js', 'export default 1;\\n');",
    '',
  ].join('\n'));
  return { checkout, packageDirectory, lockFile: path.join(checkout, 'var/locks', 'dist-fixture.lock') };
}

test('a build and a pack of a package refuse while another run holds its dist', () => {
  const { checkout, packageDirectory, lockFile } = fixtureCheckout();
  const destination = path.join(checkout, 'packs');
  fs.mkdirSync(destination);
  const build = () => spawnSync('npm', ['run', 'build'], { cwd: packageDirectory, encoding: 'utf8' });
  const pack = () => spawnSync(process.execPath, [path.join(checkout, 'scripts/package-dist.mjs'), 'pack',
    packageDirectory, destination], { cwd: checkout, encoding: 'utf8' });
  try {
    const built = build();
    assert.equal(built.status, 0, built.stderr);
    const distBefore = fs.readdirSync(path.join(packageDirectory, 'dist')).sort();
    assert.deepEqual(distBefore, ['index.js']);
    const lock = acquireHolderLock(lockFile, { command: 'npm run build' });
    try {
      const refusedBuild = build();
      assert.notEqual(refusedBuild.status, 0, refusedBuild.stdout);
      assert.match(refusedBuild.stderr, new RegExp(`${lockFile} is held by pid ${process.pid} \\(process started `));
      assert.deepEqual(fs.readdirSync(path.join(packageDirectory, 'dist')).sort(), distBefore);
      const refused = pack();
      assert.equal(refused.status, 1, refused.stderr);
      assert.match(refused.stderr, new RegExp(`${lockFile} is held by pid ${process.pid} `));
      assert.deepEqual(fs.readdirSync(destination), []);
    } finally {
      lock.release();
    }
    const packed = pack();
    assert.equal(packed.status, 0, packed.stderr);
    const report = packReport(packed.stdout, '@crudui/dist-lock-fixture');
    assert.ok(report.files.some(entry => entry.path === 'dist/index.js'), 'The archive holds the built dist');
    assert.deepEqual(fs.readdirSync(destination), [report.filename]);
    assert.equal(fs.existsSync(lockFile), false);
  } finally {
    fs.rmSync(checkout, { recursive: true, force: true });
  }
});
