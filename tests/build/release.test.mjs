import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  assetName, buildAssets, changelogSection, commitProblems, manifestProblems, NOTES_LIMIT, parseTag, publish, publishedProblems,
  releaseAssets, releaseManifests, releaseNotes, versionProblems,
} from '../../scripts/release.mjs';
import { fixtureManifests, NPM_PACKAGES } from '../../scripts/release-install.mjs';

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
  const run = async (command, args, options) => {
    calls.push([command, ...args]);
    const answer = answers[command];
    assert.ok(answer, `unexpected command ${command} ${args.join(' ')}`);
    return { status: 0, stdout: '', stderr: '', ...(typeof answer === 'function' ? answer(args, options) : answer) };
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

test('a vX.Y.Z tag archives every npm and Composer package of packages/ that is not private, and no crate', () => {
  assert.deepEqual(releaseManifests(tree(manifests('1.2.3'))), {
    'packages/js/package.json': 'npm tarball',
    'packages/cli/package.json': 'private',
    'packages/php/composer.json': 'Composer zip',
    'packages/rust/Cargo.toml': 'not released as an archive; consumed by git tag',
  });
  assert.deepEqual(releaseAssets({ tag: 'v1.2.3', ...tree(manifests('1.2.3')) }), [
    { kind: 'npm', directory: 'packages/js', name: '@polyspec/x-js', file: 'polyspec-x-js-1.2.3.tgz' },
    { kind: 'composer', directory: 'packages/php', name: 'polyspec/x-php', file: 'polyspec-x-php-1.2.3.zip' },
  ]);
});

test('the archives are written after make build by npm pack and git archive, with the package manifests unchanged', async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'release-assets-'));
  try {
    const output = path.join(work, 'release/assets');
    const assets = releaseAssets({ tag: 'v1.2.3', ...tree(manifests('1.2.3')) });
    const sources = {
      npm: `${JSON.stringify({ name: '@polyspec/x-js', version: '1.2.3', dependencies: { '@polyspec/x-core': '1.2.3', other: '^1' } }, null, 2)}\n`,
      composer: `${JSON.stringify({ name: 'polyspec/x-php', version: '1.2.3', require: { php: '^8.4' } }, null, 4)}\n`,
    };
    for (const [file, text] of [['packages/js/package.json', sources.npm], ['packages/php/composer.json', sources.composer]]) {
      fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true });
      fs.writeFileSync(path.join(work, file), text);
    }
    const packed = { ...sources };
    const { run, calls } = fakeRun({
      [process.execPath]: (args) => {
        fs.writeFileSync(path.join(args[3], 'polyspec-x-js-1.2.3.tgz'), 'npm');
        return { stdout: JSON.stringify([{ name: '@polyspec/x-js', filename: 'polyspec-x-js-1.2.3.tgz' }]) };
      },
      git: (args) => { fs.writeFileSync(args[2].slice('--output='.length), 'zip'); return {}; },
      tar: () => ({ stdout: packed.npm }),
      unzip: () => ({ stdout: packed.composer }),
      make: {},
    });
    const written = await buildAssets({ root: work, tag: 'v1.2.3', sha: SHA, assets, output, run, log: () => {} });
    assert.deepEqual(written.map((file) => path.basename(file)), ['polyspec-x-js-1.2.3.tgz', 'polyspec-x-php-1.2.3.zip']);
    assert.deepEqual(fs.readdirSync(output).sort(), ['polyspec-x-js-1.2.3.tgz', 'polyspec-x-php-1.2.3.zip']);
    assert.deepEqual(calls.map(([command, ...args]) => [command === process.execPath ? 'node' : command, ...args.map((arg) => arg.replace(work, '<work>'))]), [
      ['make', 'build'],
      ['node', '<work>/scripts/package-dist.mjs', 'pack', '<work>/packages/js', '<work>/release/assets'],
      ['git', 'archive', '--format=zip', '--output=<work>/release/assets/polyspec-x-php-1.2.3.zip', `${SHA}:packages/php`],
      ['tar', '-xzOf', '<work>/release/assets/polyspec-x-js-1.2.3.tgz', 'package/package.json'],
      ['unzip', '-p', '<work>/release/assets/polyspec-x-php-1.2.3.zip', 'composer.json'],
    ]);

    packed.npm = sources.npm.replace('"1.2.3",\n  "dependencies"', '"1.2.3",\n  "private": false,\n  "dependencies"');
    packed.composer = `${JSON.stringify({ name: 'polyspec/x-php', require: { php: '^8.4', 'polyspec/y': '@dev' }, repositories: [{ type: 'path', url: '../y' }] }, null, 4)}\n`;
    await assert.rejects(buildAssets({ root: work, tag: 'v1.2.3', sha: SHA, assets, output, run, log: () => {} }), (error) => {
      assert.equal(error.message, 'the packed manifests are not the published package manifests:\n'
        + 'polyspec-x-js-1.2.3.tgz: the packed package.json differs from packages/js/package.json\n'
        + 'polyspec-x-php-1.2.3.zip: the packed composer.json differs from packages/php/composer.json\n'
        + 'polyspec/x-php: require polyspec/y "@dev" is a development version\n'
        + 'polyspec/x-php: repositories [{"type":"path","url":"../y"}] exist only in the repository\n'
        + 'polyspec/x-php: version (none) is no release version');
      return true;
    });

    const unbuilt = fakeRun({ make: { status: 2, stderr: 'make: *** [build] Error 1\n' } });
    await assert.rejects(buildAssets({ root: work, tag: 'v1.2.3', sha: SHA, assets, output, run: unbuilt.run, log: () => {} }),
      /make build exited 2: make: \*\*\* \[build\] Error 1/);
    assert.deepEqual(unbuilt.calls, [['make', 'build']]);

    const broken = fakeRun({ make: {}, git: { status: 128, stderr: 'fatal: not a tree object\n' } });
    await assert.rejects(buildAssets({ root: work, tag: 'v1.2.3', sha: SHA, assets: assets.slice(1), output, run: broken.run, log: () => {} }),
      /the archive of polyspec\/x-php \(packages\/php\) failed: git archive .* exited 128: fatal: not a tree object/);

    fs.writeFileSync(path.join(output, 'stale.tgz'), 'stale');
    const go = fakeRun({});
    assert.deepEqual(await buildAssets({ root: work, tag: 'packages/go/v1.2.3', sha: SHA, assets: [], output, run: go.run, log: () => {} }), []);
    assert.deepEqual(go.calls, [], 'a Go module tag builds and attaches nothing');
    assert.deepEqual(fs.readdirSync(output), []);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});

test('a published manifest names every polyspec dependency by its exact version, and a Composer manifest its version', () => {
  const npm = (constraint) => manifestProblems('npm', { name: '@polyspec/x', dependencies: { '@polyspec/y': constraint, react: '^19' } });
  assert.deepEqual(npm('1.2.3'), []);
  const forms = {
    'https://github.com/polyspec/y/releases/download/v1.2.3/polyspec-y-1.2.3.tgz': 'a URL',
    'file:../y': 'a path of the repository',
    'link:../y': 'a path of the repository',
    'workspace:*': 'a path of the repository',
    'git+ssh://git@github.com/polyspec/y.git': 'a URL',
    'github:polyspec/y': 'a git source',
    'polyspec/y#v1.2.3': 'a git source',
    'git@github.com:polyspec/y.git': 'a git source',
    '^1.2.3': 'a range, not the exact released version',
    '*': 'a range, not the exact released version',
  };
  for (const [constraint, form] of Object.entries(forms)) {
    assert.deepEqual(npm(constraint), [`@polyspec/x: dependencies @polyspec/y ${JSON.stringify(constraint)} is ${form}`], constraint);
  }
  assert.deepEqual(manifestProblems('npm', { name: '@polyspec/x', peerDependencies: { '@polyspec/y': '^1' }, optionalDependencies: { '@polyspec/z': 'file:z' }, devDependencies: { '@polyspec/w': 'file:w' } }), [
    '@polyspec/x: peerDependencies @polyspec/y "^1" is a range, not the exact released version',
    '@polyspec/x: optionalDependencies @polyspec/z "file:z" is a path of the repository',
  ]);
  assert.deepEqual(manifestProblems('composer', { name: 'polyspec/x', version: '1.2.3', require: { php: '^8.4', 'polyspec/y': '1.2.3' } }), []);
  assert.deepEqual(manifestProblems('composer', {
    name: 'polyspec/x', require: { 'polyspec/y': '@dev', 'polyspec/z': 'dev-main', 'polyspec/w': '^1.2' }, repositories: [{ type: 'path', url: '../y' }],
  }), [
    'polyspec/x: require polyspec/y "@dev" is a development version',
    'polyspec/x: require polyspec/z "dev-main" is a development version',
    'polyspec/x: require polyspec/w "^1.2" is a range, not the exact released version',
    'polyspec/x: repositories [{"type":"path","url":"../y"}] exist only in the repository',
    'polyspec/x: version (none) is no release version',
  ]);
});

test('the published manifests of this repository name every polyspec dependency by its exact version', () => {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
  const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
  assert.deepEqual(publishedProblems({ files, read }), []);
  const generator = JSON.parse(read('packages/generator-php/composer.json'));
  assert.equal(generator.require['polyspec/crudui-validator'], JSON.parse(read('packages/validator-php/composer.json')).version);
  const broken = (file) => (file === 'packages/generator-php/composer.json'
    ? JSON.stringify({ ...generator, version: undefined, repositories: [{ type: 'path', url: '../validator-php' }] }) : read(file));
  assert.deepEqual(publishedProblems({ files, read: broken }), [
    'packages/generator-php/composer.json: polyspec/crudui-generator: repositories [{"type":"path","url":"../validator-php"}] exist only in the repository',
    'packages/generator-php/composer.json: polyspec/crudui-generator: version (none) is no release version',
  ]);
});

test('the consumer fixtures of tests/release-install name the archives of the version of package.json', () => {
  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/release-install', file), 'utf8'));
  const expected = fixtureManifests(version);
  assert.deepEqual(read('npm/package.json'), expected.npm, 'make release-install-lock writes the npm fixture');
  assert.deepEqual(read('composer/composer.json'), expected.composer, 'make release-install-lock writes the Composer fixture');
  const npmLock = read('npm/package-lock.json');
  assert.deepEqual(NPM_PACKAGES.map((name) => [npmLock.packages[`node_modules/${name}`]?.version, npmLock.packages[`node_modules/${name}`]?.resolved]),
    NPM_PACKAGES.map((name) => [version, `file:${assetName(name, version, 'tgz')}`]));
  const composerLock = read('composer/composer.lock');
  assert.deepEqual(composerLock.packages.map(({ name, version: locked, dist }) => [name, locked, dist.url]).sort(), [
    ['polyspec/crudui-generator', version, `archives/${assetName('polyspec/crudui-generator', version, 'zip')}`],
    ['polyspec/crudui-validator', version, `archives/${assetName('polyspec/crudui-validator', version, 'zip')}`],
  ]);
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

test('the notes are the change log section up to 125000 characters, and one line linking CHANGELOG.md above it', () => {
  assert.equal(NOTES_LIMIT, 125000);
  const whole = '\u{1F600}'.repeat(NOTES_LIMIT);
  assert.equal(releaseNotes({ section: whole, tag: 'v0.0.2' }), whole);
  const line = 'The changes of 0.0.2 are listed in [CHANGELOG.md](https://github.com/polyspec/crudui/blob/v0.0.2/CHANGELOG.md#002).';
  assert.equal(releaseNotes({ section: `${whole}x`, tag: 'v0.0.2' }), line);
  assert.equal(releaseNotes({ section: 'x'.repeat(360629), tag: 'packages/generator-go/v0.0.2' }),
    'The changes of 0.0.2 are listed in [CHANGELOG.md](https://github.com/polyspec/crudui/blob/packages/generator-go/v0.0.2/CHANGELOG.md#002).');
});

test('a change log section over the limit is published as the one line linking CHANGELOG.md', async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'release-publish-'));
  try {
    const output = path.join(work, 'release/assets');
    const long = `# Changes\n\n## Unreleased\n\n## 1.2.3\n\n${'- Text.\n'.repeat(20000)}\n## 1.2.2\n`;
    const read = (file) => ({ 'CHANGELOG.md': long })[file];
    const { run, calls } = fakeRun({ gh: {} });
    await publish({ root: work, tag: 'packages/go/v1.2.3', output, run, read });
    const notes = path.join(work, 'release/notes.md');
    assert.deepEqual(calls, [['gh', 'release', 'create', 'packages/go/v1.2.3', '--verify-tag', '--title', 'packages/go/v1.2.3', '--notes-file', notes]]);
    assert.equal(fs.readFileSync(notes, 'utf8'),
      'The changes of 1.2.3 are listed in [CHANGELOG.md](https://github.com/polyspec/crudui/blob/packages/go/v1.2.3/CHANGELOG.md#123).\n');
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
  assert.deepEqual(releaseManifests({ files, read }), {
    'packages/cli/package.json': 'private',
    'packages/form-binding/package.json': 'npm tarball',
    'packages/generator-core/package.json': 'npm tarball',
    'packages/generator-html/package.json': 'npm tarball',
    'packages/generator-php/composer.json': 'Composer zip',
    'packages/generator-react/package.json': 'npm tarball',
    'packages/generator-rust/Cargo.toml': 'not released as an archive; consumed by git tag',
    'packages/generator-svelte/package.json': 'npm tarball',
    'packages/generator-vue/package.json': 'npm tarball',
    'packages/validator-php/composer.json': 'Composer zip',
    'packages/validator-rust/Cargo.toml': 'not released as an archive; consumed by git tag',
    'packages/validator-ts/package.json': 'npm tarball',
  });
  assert.deepEqual(releaseAssets({ tag: `v${version}`, files, read }).map(({ file }) => file).sort(), [
    `polyspec-crudui-form-binding-${version}.tgz`, `polyspec-crudui-generator-${version}.zip`,
    `polyspec-crudui-generator-core-${version}.tgz`, `polyspec-crudui-generator-html-${version}.tgz`,
    `polyspec-crudui-generator-react-${version}.tgz`, `polyspec-crudui-generator-svelte-${version}.tgz`,
    `polyspec-crudui-generator-vue-${version}.tgz`, `polyspec-crudui-validator-${version}.tgz`,
    `polyspec-crudui-validator-${version}.zip`,
  ]);
  assert.ok(releaseAssets({ tag: `v${version}`, files, read }).every(({ file }) => /\.(tgz|zip)$/.test(file)), 'the release assets are npm tarballs and Composer zips only');
});
