import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  assetName, buildAssets, changelogSection, commitProblems, parseTag, publish, releaseAssets, versionProblems,
} from '../../scripts/release.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SHA = 'a'.repeat(40);
const CHANGELOG = '# Changes\n\n## Unreleased\n\n## 1.2.3\n\n### 2026-10-07 — A change (C1)\n\n- Text.\n\n## 1.2.2\n\n### 2026-10-06 — B (C0)\n';

/** A repository of the given files for versionProblems and releaseAssets. */
function tree(files) {
  return { files: Object.keys(files), read: (file) => { assert.ok(file in files, `read ${file}`); return files[file]; } };
}

const manifests = (version) => ({
  'CHANGELOG.md': CHANGELOG,
  'package.json': JSON.stringify({ name: '@polyspec/x-workspace', version, private: true }),
  'packages/js/package.json': JSON.stringify({ name: '@polyspec/x-js', version }),
  'packages/cli/package.json': JSON.stringify({ name: '@polyspec/x-cli', version, private: true }),
  'packages/php/composer.json': JSON.stringify({ name: 'polyspec/x-php' }),
  'packages/rust/Cargo.toml': `[package]\nname = "polyspec-x"\nversion = "${version}"\n\n[dependencies]\nserde = { version = "1" }\n`,
  'packages/go/go.mod': 'module github.com/polyspec/x/packages/go\n',
  'examples/server/Cargo.toml': `[package]\nname = "polyspec-x-example"\nversion = "${version}"\npublish = false\n`,
  'tools/py/pyproject.toml': `[project]\nname = "x-tool"\nversion = "${version}"\n`,
  'VERSION': `${version}\n`,
});

/** A command runner that answers from `answers` by command and records each call. */
function fakeRun(answers) {
  const calls = [];
  const run = async (command, args) => {
    calls.push([command, ...args]);
    const answer = answers[command];
    assert.ok(answer, `unexpected command ${command} ${args.join(' ')}`);
    return { status: 0, stdout: '', stderr: '', ...(typeof answer === 'function' ? answer(args) : answer) };
  };
  return { run, calls };
}

const checkRuns = (...runs) => runs.map(([name, status, conclusion]) => JSON.stringify({ name, status, conclusion })).join('\n');

test('a tag is vX.Y.Z or <directory>/vX.Y.Z', () => {
  assert.deepEqual(parseTag('v1.2.3'), { tag: 'v1.2.3', directory: '', version: '1.2.3' });
  assert.deepEqual(parseTag('packages/go/v0.1.0'), { tag: 'packages/go/v0.1.0', directory: 'packages/go', version: '0.1.0' });
  for (const tag of ['1.2.3', 'v1.2', 'v1.2.3-rc.1', 'packages/go/1.2.3', undefined]) assert.throws(() => parseTag(tag), /is not vX\.Y\.Z or <directory>\/vX\.Y\.Z/);
});

test('an archive is named <package>-<version>.<extension> with @scope/ written scope-', () => {
  assert.equal(assetName('@polyspec/crudui-validator', '1.2.3', 'tgz'), 'polyspec-crudui-validator-1.2.3.tgz');
  assert.equal(assetName('polyspec/crudui-validator', '1.2.3', 'zip'), 'polyspec-crudui-validator-1.2.3.zip');
  assert.equal(assetName('polyspec-crudui-validator', '1.2.3', 'crate'), 'polyspec-crudui-validator-1.2.3.crate');
});

test('every package file that the tag covers has the version of the tag', () => {
  assert.deepEqual(versionProblems({ tag: 'v1.2.3', ...tree(manifests('1.2.3')) }), []);
  const files = manifests('1.2.3');
  files['packages/rust/Cargo.toml'] = files['packages/rust/Cargo.toml'].replace('version = "1.2.3"', 'version = "1.2.2"');
  files['packages/php/composer.json'] = JSON.stringify({ name: 'polyspec/x-php', version: '1.0.0' });
  files['tools/py/pyproject.toml'] = '[project]\nname = "x-tool"\n';
  files.VERSION = '1.2.4\n';
  assert.deepEqual(versionProblems({ tag: 'v1.2.3', ...tree(files) }), [
    'packages/php/composer.json: version 1.0.0, tag v1.2.3 has 1.2.3',
    'packages/rust/Cargo.toml: version 1.2.2, tag v1.2.3 has 1.2.3',
    'tools/py/pyproject.toml: version (none), tag v1.2.3 has 1.2.3',
    'VERSION: version 1.2.4, tag v1.2.3 has 1.2.3',
  ]);
});

test('the tag needs the section ## X.Y.Z of CHANGELOG.md, which holds its notes', () => {
  const files = { ...manifests('1.2.4'), 'CHANGELOG.md': CHANGELOG };
  assert.deepEqual(versionProblems({ tag: 'v1.2.4', ...tree(files) }), ['CHANGELOG.md: no section ## 1.2.4, tag v1.2.4 has 1.2.4']);
  assert.equal(changelogSection(CHANGELOG, '1.2.3'), '### 2026-10-07 — A change (C1)\n\n- Text.');
  assert.equal(changelogSection(CHANGELOG, '1.2.2'), '### 2026-10-06 — B (C0)');
  assert.equal(changelogSection(CHANGELOG, '1.2'), null);
});

test('a Go module tag covers the package files of its directory and needs its go.mod', () => {
  const files = manifests('9.9.9');
  assert.deepEqual(versionProblems({ tag: 'packages/go/v1.2.3', ...tree(files) }), []);
  assert.deepEqual(versionProblems({ tag: 'packages/js/v1.2.3', ...tree(files) }), [
    'packages/js/go.mod: the tag packages/js/v1.2.3 names no Go module',
    'packages/js/package.json: version 9.9.9, tag packages/js/v1.2.3 has 1.2.3',
  ]);
  assert.deepEqual(releaseAssets({ tag: 'packages/go/v1.2.3', ...tree(files) }), []);
});

test('the commit of a tag is on main and its checks push-gate and ci-passed succeeded', async () => {
  const passed = fakeRun({ git: { status: 0 }, gh: { stdout: checkRuns(['build', 'completed', 'failure'], ['push-gate', 'completed', 'success'], ['ci-passed', 'completed', 'success']) } });
  assert.deepEqual(await commitProblems({ sha: SHA, repository: 'polyspec/x', run: passed.run }), []);
  assert.deepEqual(passed.calls, [
    ['git', 'merge-base', '--is-ancestor', SHA, 'origin/main'],
    ['gh', 'api', '--paginate', `repos/polyspec/x/commits/${SHA}/check-runs?per_page=100`, '--jq', '.check_runs[] | {name, status, conclusion}'],
  ]);

  const failed = fakeRun({ git: { status: 1 }, gh: { stdout: checkRuns(['push-gate', 'completed', 'success'], ['push-gate', 'in_progress', null], ['ci-passed', 'completed', 'failure']) } });
  assert.deepEqual(await commitProblems({ sha: SHA, repository: 'polyspec/x', run: failed.run }), [
    `the commit ${SHA} is not on origin/main`,
    `the check push-gate on ${SHA} is in_progress with conclusion null; expected completed with conclusion success`,
    `the check ci-passed on ${SHA} is completed with conclusion failure; expected completed with conclusion success`,
  ]);

  const missing = fakeRun({ git: { status: 0 }, gh: { stdout: checkRuns(['push-gate', 'completed', 'success']) } });
  assert.deepEqual(await commitProblems({ sha: SHA, repository: 'polyspec/x', run: missing.run }), [`the check ci-passed has no run on ${SHA}; expected conclusion success`]);

  const refused = fakeRun({ git: { status: 128, stderr: 'fatal: Not a valid commit name\n' }, gh: { status: 1, stderr: 'HTTP 404\n' } });
  assert.deepEqual(await commitProblems({ sha: SHA, repository: 'polyspec/x', run: refused.run }), [
    `git merge-base --is-ancestor ${SHA} origin/main exited 128: fatal: Not a valid commit name`,
    `gh api repos/polyspec/x/commits/${SHA}/check-runs exited 1: HTTP 404`,
  ]);
});

test('a vX.Y.Z tag archives every package of packages/ that is not private', () => {
  assert.deepEqual(releaseAssets({ tag: 'v1.2.3', ...tree(manifests('1.2.3')) }), [
    { kind: 'npm', directory: 'packages/js', name: '@polyspec/x-js', file: 'polyspec-x-js-1.2.3.tgz' },
    { kind: 'composer', directory: 'packages/php', name: 'polyspec/x-php', file: 'polyspec-x-php-1.2.3.zip' },
    { kind: 'cargo', directory: 'packages/rust', name: 'polyspec-x', file: 'polyspec-x-1.2.3.crate' },
  ]);
});

test('the archives are written by npm pack, git archive and cargo package under their release names', async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'release-assets-'));
  try {
    const output = path.join(work, 'release/assets');
    const assets = releaseAssets({ tag: 'v1.2.3', ...tree(manifests('1.2.3')) });
    const { run, calls } = fakeRun({
      [process.execPath]: (args) => {
        fs.writeFileSync(path.join(args[3], 'polyspec-x-js-1.2.3.tgz'), 'npm');
        return { stdout: JSON.stringify([{ name: '@polyspec/x-js', filename: 'polyspec-x-js-1.2.3.tgz' }]) };
      },
      git: (args) => { fs.writeFileSync(args[2].slice('--output='.length), 'zip'); return {}; },
      cargo: (args) => {
        const target = args[args.indexOf('--target-dir') + 1];
        fs.mkdirSync(path.join(target, 'package'), { recursive: true });
        fs.writeFileSync(path.join(target, 'package/polyspec-x-1.2.3.crate'), 'crate');
        return {};
      },
    });
    const written = await buildAssets({ root: work, sha: SHA, assets, output, run, log: () => {} });
    assert.deepEqual(written.map((file) => path.basename(file)), ['polyspec-x-js-1.2.3.tgz', 'polyspec-x-php-1.2.3.zip', 'polyspec-x-1.2.3.crate']);
    assert.deepEqual(fs.readdirSync(output).sort(), ['polyspec-x-1.2.3.crate', 'polyspec-x-js-1.2.3.tgz', 'polyspec-x-php-1.2.3.zip']);
    assert.deepEqual(calls.map(([command, ...args]) => [command === process.execPath ? 'node' : command, ...args.map((arg) => arg.replace(work, '<work>'))]), [
      ['node', '<work>/scripts/package-dist.mjs', 'pack', '<work>/packages/js', '<work>/release/assets'],
      ['git', 'archive', '--format=zip', '--output=<work>/release/assets/polyspec-x-php-1.2.3.zip', `${SHA}:packages/php`],
      ['cargo', 'package', '--no-verify', '--exclude-lockfile', '--manifest-path', '<work>/packages/rust/Cargo.toml', '--target-dir', '<work>/release/cargo'],
    ]);

    const broken = fakeRun({ cargo: { status: 101, stderr: 'error: failed to prepare local package\n' } });
    await assert.rejects(buildAssets({ root: work, sha: SHA, assets: assets.slice(2), output, run: broken.run, log: () => {} }),
      /the archive of polyspec-x \(packages\/rust\) failed: exit 101: error: failed to prepare local package/);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});

test('the GitHub Release of a tag carries its change log section and its archives', async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'release-publish-'));
  try {
    const output = path.join(work, 'release/assets');
    const read = (file) => ({ 'CHANGELOG.md': CHANGELOG })[file];
    const { run, calls } = fakeRun({ gh: {} });
    await assert.rejects(publish({ root: work, tag: 'v1.2.3', output, run, read }), /holds no archive for v1\.2\.3; run make release-assets first/);
    fs.mkdirSync(output, { recursive: true });
    for (const file of ['b-1.2.3.zip', 'a-1.2.3.tgz']) fs.writeFileSync(path.join(output, file), file);
    await publish({ root: work, tag: 'v1.2.3', output, run, read });
    const notes = path.join(work, 'release/notes.md');
    assert.deepEqual(calls, [['gh', 'release', 'create', 'v1.2.3', '--verify-tag', '--title', 'v1.2.3', '--notes-file', notes,
      path.join(output, 'a-1.2.3.tgz'), path.join(output, 'b-1.2.3.zip')]]);
    assert.equal(fs.readFileSync(notes, 'utf8'), '### 2026-10-07 — A change (C1)\n\n- Text.\n');

    fs.rmSync(output, { recursive: true });
    const go = fakeRun({ gh: {} });
    await publish({ root: work, tag: 'packages/go/v1.2.3', output, run: go.run, read });
    assert.deepEqual(go.calls, [['gh', 'release', 'create', 'packages/go/v1.2.3', '--verify-tag', '--title', 'packages/go/v1.2.3', '--notes-file', notes]]);
    await assert.rejects(publish({ root: work, tag: 'v9.9.9', output, run, read }), /CHANGELOG\.md: no section ## 9\.9\.9/);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});

test('the package files of this repository have one version, and its archives are the published packages', () => {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
  const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
  const { version } = JSON.parse(read('package.json'));
  const changelog = changelogSection(read('CHANGELOG.md'), version) === null ? [`CHANGELOG.md: no section ## ${version}, tag v${version} has ${version}`] : [];
  assert.deepEqual(versionProblems({ tag: `v${version}`, files, read }), changelog);
  assert.deepEqual(releaseAssets({ tag: `v${version}`, files, read }).map(({ file }) => file).sort(), [
    `polyspec-crudui-form-binding-${version}.tgz`, `polyspec-crudui-generator-${version}.crate`, `polyspec-crudui-generator-${version}.zip`,
    `polyspec-crudui-generator-core-${version}.tgz`, `polyspec-crudui-generator-html-${version}.tgz`,
    `polyspec-crudui-generator-react-${version}.tgz`, `polyspec-crudui-generator-svelte-${version}.tgz`,
    `polyspec-crudui-generator-vue-${version}.tgz`, `polyspec-crudui-validator-${version}.crate`,
    `polyspec-crudui-validator-${version}.tgz`, `polyspec-crudui-validator-${version}.zip`,
  ]);
});
