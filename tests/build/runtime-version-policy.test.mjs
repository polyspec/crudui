import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

import { recordedToolchain, toolchainMismatches, toolchainVersions } from '../../scripts/check-toolchain.mjs';
import { trackedFiles } from '../../scripts/tracked-files.mjs';
import { makeDryRun } from './make-dry-run.mjs';

const repository = fileURLToPath(new URL('../..', import.meta.url));

/** The container definitions of the checkout: Dockerfile and *Containerfile among its tracked files. */
async function findContainerDefinitions() {
  return trackedFiles(repository).filter(file => /(?:^|\/)(?:Dockerfile|[^/]*Containerfile)$/.test(file)).map(file => path.join(repository, file));
}

/** The exact npm release that `packageManager` of package.json records. */
async function recordedNpm() {
  const manifest = JSON.parse(await readFile(path.join(repository, 'package.json'), 'utf8'));
  const match = /^npm@(\d+\.\d+\.\d+)$/.exec(manifest.packageManager ?? '');
  assert.ok(match, `package.json must record one exact npm release as packageManager npm@<major>.<minor>.<patch>; it records ${manifest.packageManager}`);
  return match[1];
}

test('the npm that runs here is the release that package.json records', async () => {
  const recorded = await recordedNpm();
  const running = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'], { encoding: 'utf8' });
  assert.equal(running.error, undefined, running.error?.message);
  assert.equal(running.stdout.trim(), recorded,
    `npm ${running.stdout.trim()} runs here and package.json records npm ${recorded}; fix: node scripts/install-npm.mjs installs it into .tools/npm, and make puts .tools/npm/node_modules/.bin first on PATH`);
});

test('every workflow job installs the recorded npm before it runs npm', async () => {
  await recordedNpm();
  const directory = path.join(repository, '.github/workflows');
  const violations = [];
  for (const file of (await readdir(directory)).filter(name => /\.ya?ml$/.test(name))) {
    const workflow = parse(await readFile(path.join(directory, file), 'utf8'));
    for (const [id, job] of Object.entries(workflow.jobs ?? {})) {
      let installed = false;
      for (const step of job.steps ?? []) {
        if (typeof step.run !== 'string') continue;
        for (const command of step.run.split(/\n|&&/).map(text => text.trim()).filter(Boolean)) {
          if (/\bnpm@|\bnpm (?:i|install) (?:-g|--global)\b/.test(command)) violations.push(`${file} ${id}: \`${command}\` selects an npm release`);
          if (command === 'node scripts/install-npm.mjs') installed = true;
          else if (/^npm\b/.test(command) && !installed) violations.push(`${file} ${id}: \`${command}\` runs before node scripts/install-npm.mjs`);
        }
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('container definitions and the Linux style check install the recorded npm', async () => {
  const recorded = await recordedNpm();
  const violations = [];
  for (const definition of await findContainerDefinitions()) {
    const source = await readFile(definition, 'utf8');
    if (!/^FROM node:/m.test(source)) continue;
    const name = path.relative(repository, definition);
    const installs = [...source.matchAll(/npm(?:-cli\.js)? install -g npm@(\S+)/g)].map(match => match[1]);
    if (installs.length !== 1 || installs[0] !== recorded) violations.push(`${name} installs npm ${installs.join(', ') || 'from its image'}, package.json records ${recorded}`);
  }
  const styles = await readFile(path.join(repository, 'scripts/test-form-styles-linux.sh'), 'utf8');
  const install = styles.indexOf('node scripts/install-npm.mjs');
  if (install === -1 || install > styles.indexOf('npm ci')) violations.push('scripts/test-form-styles-linux.sh runs npm ci before node scripts/install-npm.mjs');
  assert.deepEqual(violations, []);
});

const read = file => readFile(path.join(repository, file), 'utf8');

/** Every workflow file with its parsed content. */
async function workflows() {
  const directory = path.join(repository, '.github/workflows');
  return Promise.all((await readdir(directory)).filter(name => /\.ya?ml$/.test(name)).map(async file => ({ file, text: await read(`.github/workflows/${file}`), workflow: parse(await read(`.github/workflows/${file}`)) })));
}

test('the checkout records one exact version of every tool', async () => {
  const recorded = recordedToolchain(repository);
  assert.match(recorded.node, /^\d+\.\d+\.\d+$/);
  assert.equal(Number(recorded.node.split('.')[0]) % 2, 0, 'the Node.js release must be of an even, LTS-designated major');
  const toolchain = await read('rust-toolchain.toml');
  assert.match(toolchain, /^profile = "minimal"$/m);
  assert.match(toolchain, /^components = \["rustfmt", "clippy"\]$/m);
  const config = JSON.parse(await read('config/toolchain.json'));
  assert.match(config.node['linux-x64.tar.gz'], /^[0-9a-f]{64}$/, 'config/toolchain.json records the SHA-256 of the Linux x64 archive of the Node.js release');
  // setup-php and Homebrew cannot install the same patch, so PHP is pinned by its minor release; the patch is evidence.
  assert.ok(config.php.length > 0 && config.php.every(release => /^\d+\.\d+$/.test(release)), `config/toolchain.json must record php as minor releases; it records ${JSON.stringify(config.php)}`);
  // Python, a test tool of tests/ordered-json, is pinned by its minor release like PHP.
  assert.match(config.python, /^\d+\.\d+$/, 'config/toolchain.json must record python as one minor release');
});

test('every tool runs at the version that the checkout records, PHP at a recorded minor', () => {
  assert.deepEqual(toolchainMismatches(['node', 'npm', 'go', 'rust', 'php', 'python', 'composer'], { root: repository }), []);
});

test('the running releases are reported, the patch of PHP included', () => {
  const outputs = { node: 'v26.8.1\n', php: '8.5.10\n' };
  const run = command => ({ status: 0, stdout: outputs[command] ?? '', stderr: '' });
  assert.deepEqual(toolchainVersions(['node', 'php'], { root: repository, run }), { node: '26.8.1', php: '8.5.10' });
  assert.deepEqual(toolchainVersions(['go'], { root: repository, run: () => ({ status: 1, stdout: '' }) }), { go: 'unavailable: go exited with 1' });
});

test('a tool at another version fails with its record, the expected and the running version and the fix', () => {
  const recorded = recordedToolchain(repository);
  const outputs = { node: 'v1.2.3\n', rustc: 'rustc 1.0.0 (abc 2020-01-01)\n', php: '8.3.30\n' };
  const run = command => (command === 'go' ? { status: 1, stdout: '', stderr: 'go: not found' } : { status: 0, stdout: outputs[command] ?? '', stderr: '' });
  // Another patch of a recorded minor is accepted.
  assert.deepEqual(toolchainMismatches(['php'], { root: repository, run: () => ({ status: 0, stdout: `${recorded.php[0]}.99\n` }) }), []);
  assert.deepEqual(toolchainMismatches(['python'], { root: repository, run: () => ({ status: 0, stdout: `Python ${recorded.python}.99\n` }) }), []);
  assert.deepEqual(toolchainMismatches(['python'], { root: repository, run: () => ({ status: 0, stdout: 'Python 3.1.4\n' }) }), [
    `python: 3.1.4 runs here and config/toolchain.json python records ${recorded.python}; fix: install python ${recorded.python}`,
  ]);
  assert.deepEqual(toolchainMismatches(['node', 'rust', 'php', 'go'], { root: repository, run }), [
    `node: 1.2.3 runs here and .node-version records ${recorded.node}; fix: install node ${recorded.node}`,
    `rust: 1.0.0 runs here and rust-toolchain.toml records ${recorded.rust}; fix: make install (rustup toolchain install --no-self-update)`,
    `php: 8.3.30 runs here and config/toolchain.json php records ${recorded.php.join(' or ')}; fix: install php ${recorded.php.join(' or ')}`,
    'go: `go env GOVERSION` failed (status 1): go: not found',
  ]);
});

// The type definitions of Node.js describe the runtime that runs the code, so every manifest requires the major of
// the recorded Node.js release.
test('every @types/node range requires the major of .node-version', async () => {
  const major = recordedToolchain(repository).node.split('.')[0];
  const files = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*package.json'], { cwd: repository, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  const violations = [];
  for (const file of files) {
    let manifest;
    try { manifest = JSON.parse(await read(file)); } catch { continue; }
    for (const field of ['dependencies', 'devDependencies']) {
      const range = manifest[field]?.['@types/node'];
      if (range !== undefined && !new RegExp(`^[\\^~]?${major}\\.`).test(range)) violations.push(`${file} ${field}: @types/node ${range}, .node-version records Node.js ${major}`);
    }
  }
  assert.deepEqual(violations, []);
});

test('every go.mod names the recorded Go release as its toolchain', async () => {
  const { go } = recordedToolchain(repository);
  const files = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*go.mod'], { cwd: repository, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  assert.ok(files.length > 0);
  const violations = [];
  for (const file of files) {
    const lines = [...(await read(file)).matchAll(/^toolchain (\S+)$/gm)].map(match => match[1]);
    if (lines.length !== 1 || lines[0] !== `go${go}`) violations.push(`${file}: toolchain ${lines.join(', ') || 'missing'}, .go-version records ${go}`);
  }
  assert.deepEqual(violations, []);
});

test('make installs nothing on its own and make install installs the Rust toolchain', async () => {
  const makefile = await read('Makefile');
  assert.match(makefile, /^export RUSTUP_AUTO_INSTALL := 0$/m);
  assert.match(makefile, /^export GOTOOLCHAIN := local$/m);
  const install = makeDryRun(repository, 'install');
  assert.equal(install.status, 0, install.stderr);
  assert.ok(install.stdout.split('\n').includes('rustup toolchain install --no-self-update'), install.stdout);
});

test('every workflow runs on ubuntu-24.04 with actions named by commit SHA and no auto-install', async () => {
  const violations = [];
  for (const { file, text, workflow } of await workflows()) {
    if (workflow.env?.RUSTUP_AUTO_INSTALL !== '0' || workflow.env?.GOTOOLCHAIN !== 'local') violations.push(`${file}: env must set RUSTUP_AUTO_INSTALL: '0' and GOTOOLCHAIN: local`);
    for (const [id, job] of Object.entries(workflow.jobs)) {
      if (job['runs-on'] !== 'ubuntu-24.04') violations.push(`${file} ${id}: runs-on ${job['runs-on']}`);
    }
    for (const line of text.split('\n').filter(entry => /^\s*(?:- )?uses:/.test(entry))) {
      if (!/uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v?\d+\.\d+\.\d+$/.test(line)) violations.push(`${file}: ${line.trim()} is not named by the commit SHA of a release with the release in a comment`);
    }
  }
  assert.deepEqual(violations, []);
});

test('every CI job sets up the recorded toolchains and checks the tools it set up', async () => {
  const recorded = recordedToolchain(repository);
  const minors = recorded.php;
  const violations = [];
  for (const { file, workflow } of await workflows()) {
    for (const [id, job] of Object.entries(workflow.jobs)) {
      const steps = job.steps ?? [];
      if (!steps.some(step => String(step.uses ?? '').startsWith('actions/checkout@'))) continue;
      const tools = ['node'];
      let checked;
      steps.forEach((step, index) => {
        const uses = String(step.uses ?? '');
        const run = String(step.run ?? '');
        if (uses.startsWith('actions/setup-node@') && step.with?.['node-version-file'] !== '.node-version') violations.push(`${file} ${id}: setup-node must read .node-version`);
        if (uses.startsWith('actions/setup-go@')) {
          tools.push('go');
          if (step.with?.['go-version-file'] !== '.go-version') violations.push(`${file} ${id}: setup-go must read .go-version`);
        }
        if (uses.startsWith('shivammathur/setup-php@')) {
          tools.push('php', 'composer');
          const versions = step.with?.['php-version'] === '${{ matrix.php }}' ? job.strategy.matrix.php.map(String) : [String(step.with?.['php-version'])];
          for (const version of versions) if (!minors.includes(version)) violations.push(`${file} ${id}: PHP ${version} is not a minor of config/toolchain.json`);
          if (step.with?.tools !== `composer:${recorded.composer}`) violations.push(`${file} ${id}: setup-php must install composer:${recorded.composer}`);
        }
        if (uses.startsWith('actions/setup-python@')) {
          tools.push('python');
          if (String(step.with?.['python-version']) !== recorded.python) violations.push(`${file} ${id}: setup-python must install the recorded minor ${recorded.python}`);
        }
        if (/rust-toolchain|dtolnay/.test(uses)) violations.push(`${file} ${id}: ${uses} selects a Rust toolchain; run rustup toolchain install --no-self-update`);
        if (run.split('\n').includes('rustup toolchain install --no-self-update')) tools.push('rust');
        if (run.split('\n').includes('node scripts/install-npm.mjs')) tools.push('npm');
        const check = /^node scripts\/check-toolchain\.mjs (.+)$/m.exec(run);
        if (check) checked = { tools: check[1].split(' '), index };
      });
      if (!checked) violations.push(`${file} ${id}: no step runs node scripts/check-toolchain.mjs`);
      else if ([...checked.tools].sort().join(' ') !== [...tools].sort().join(' ')) violations.push(`${file} ${id}: checks ${checked.tools.join(' ')}, sets up ${tools.join(' ')}`);
    }
  }
  assert.deepEqual(violations, []);
});

test('container stages name their images by exact tag and digest and install Debian packages of one date', async () => {
  const recorded = recordedToolchain(repository);
  const prefixes = { node: `${recorded.node}-`, golang: `${recorded.go}-`, rust: `${recorded.rust}-` };
  const definitions = await findContainerDefinitions();
  assert.ok(definitions.length > 0);
  const violations = [];
  for (const definition of definitions) {
    const name = path.relative(repository, definition);
    const source = await readFile(definition, 'utf8');
    for (const [, image, tag, digest] of source.matchAll(/^FROM\s+([^\s:@]+):([^\s@]+)(?:@(sha256:[0-9a-f]{64}))?/gm)) {
      if (!digest) violations.push(`${name}: FROM ${image}:${tag} has no digest`);
      if (prefixes[image] && !tag.startsWith(prefixes[image])) violations.push(`${name}: ${image}:${tag} is not the recorded release ${prefixes[image].slice(0, -1)}`);
    }
    if (/apt-get update/.test(source) && !/snapshot\.debian\.org\/archive\/debian\/\d{8}T\d{6}Z/.test(source)) violations.push(`${name}: apt-get reads the live Debian archive`);
    if (!/RUSTUP_AUTO_INSTALL=0/.test(source) || !/GOTOOLCHAIN=local/.test(source)) violations.push(`${name}: the image must set RUSTUP_AUTO_INSTALL=0 and GOTOOLCHAIN=local`);
  }
  assert.deepEqual(violations, []);
});

test('the Linux style check installs the recorded Node.js archive and the pinned browsers', async () => {
  const script = await read('scripts/test-form-styles-linux.sh');
  assert.doesNotMatch(script, /latest|@stable|playwright install chrome/);
  assert.match(script, /https:\/\/nodejs\.org\/dist\/v\$NODE_VERSION\/\$tarball/);
  assert.match(script, /sha256sum -c/);
  assert.match(script, /NODE_VERSION=\$\(cat "\$ROOT\/\.node-version"\)/);
  assert.match(script, /node scripts\/install-browsers\.mjs chrome firefox --chrome-sandbox/);
});

test('no browser of a release channel or of the machine is installed or launched', async () => {
  const files = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'scripts', 'tests', '.github', 'Makefile'], { cwd: repository, encoding: 'utf8' }).stdout.split('\n').filter(file => file && !file.endsWith('runtime-version-policy.test.mjs'));
  const violations = [];
  for (const file of files) {
    let source;
    try { source = await read(file); } catch { continue; }
    source.split('\n').forEach((line, index) => {
      if (/browsers install \S+@(?:stable|latest|beta|dev|canary)\b|\/opt\/google\/chrome|\/Applications\/Firefox|\/usr\/bin\/firefox|CRUDUI_FIREFOX_EXECUTABLE/.test(line)) violations.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(violations, []);
});

test('the declared contract commands run in a shell without login files', async () => {
  const runner = await read('scripts/run-contract-tests.mjs');
  assert.match(runner, /args: \['-c', command\]/);
  assert.doesNotMatch(runner, /'-lc'|'-l'/);
});

/** The Composer manifests of the checkout among its tracked files. */
async function composerManifests() {
  return trackedFiles(repository).filter(file => /(?:^|\/)composer\.json$/.test(file)).map(file => path.join(repository, file));
}

/** The PHP minors from `lowest` to `newest`, as `8.N` strings. */
function phpMinors(lowest, newest) {
  const [lowMajor, lowMinor] = lowest.split('.').map(Number);
  const [highMajor, highMinor] = newest.split('.').map(Number);
  assert.equal(lowMajor, highMajor, 'The supported PHP range must stay within one major');
  return Array.from({ length: highMinor - lowMinor + 1 }, (_, i) => `${lowMajor}.${lowMinor + i}`);
}

test('the declared PHP range is the range CI tests, and containers use the newest tested line', async () => {
  const workflow = parse(await readFile(path.join(repository, '.github/workflows/ci.yml'), 'utf8'));
  const composer = await composerManifests();
  assert.ok(composer.length > 0, 'At least one Composer manifest is required');
  const constraints = [];
  for (const file of composer) {
    const constraint = JSON.parse(await readFile(file, 'utf8')).require?.php;
    constraints.push({ file: path.relative(repository, file), constraint });
  }
  const lowest = constraints[0].constraint?.match(/^\^(\d+\.\d+)$/)?.[1];
  assert.ok(lowest, `PHP constraints must be one caret range: ${JSON.stringify(constraints)}`);
  assert.deepEqual(constraints.filter(({ constraint }) => constraint !== `^${lowest}`), [],
    `Every Composer manifest must require PHP ^${lowest}`);

  const selected = [];
  for (const job of Object.values(workflow.jobs)) {
    for (const step of job.steps ?? []) {
      if (String(step.uses ?? '').startsWith('shivammathur/setup-php@')) {
        const version = String(step.with?.['php-version'] ?? '');
        selected.push(version === '${{ matrix.php }}' ? job.strategy.matrix.php.map(String) : [version]);
      }
    }
  }
  const newest = selected.flat().sort((a, b) => Number(a.split('.')[1]) - Number(b.split('.')[1])).at(-1);
  const range = phpMinors(lowest, newest);
  assert.deepEqual(selected.flat().filter((version) => !range.includes(version)), [],
    `CI must select PHP lines inside ^${lowest}`);

  // Every job that runs a PHP package's own test suite covers the whole declared range.
  for (const [name, job] of Object.entries(workflow.jobs)) {
    const commands = (job.steps ?? []).map((step) => String(step.run ?? '')).join('\n');
    if (/composer --working-dir=packages\/[^ ]+ test\b|make test-native\b/.test(commands)) {
      assert.deepEqual(job.strategy?.matrix?.php?.map(String), range,
        `${name} tests a PHP package and must run on every line from ${lowest} to ${newest}`);
    }
  }

  // The PHP of every container: the tag of a php stage and the minor of an apt package php8.N-*.
  // An image keeps its exact tag with its digest, which reproduces by digest; its minor is the newest recorded one.
  const { php: minors, composer: composerRelease } = recordedToolchain(repository);
  assert.ok(minors.includes(newest), `config/toolchain.json does not record the newest tested minor ${newest}`);
  const release = newest;
  const found = [];
  const violations = [];
  for (const definition of await findContainerDefinitions()) {
    const name = path.relative(repository, definition);
    const source = await readFile(definition, 'utf8');
    for (const [, tag] of source.matchAll(/^FROM\s+php:([^\s@]+)/gm)) {
      found.push(`${name}: php:${tag}`);
      if (!new RegExp(`^${release.replace('.', '\\.')}\\.\\d+-`).test(tag)) violations.push(`${name}: php:${tag} is not an exact release of the minor ${release}`);
    }
    for (const [, minor] of source.matchAll(/\bphp(\d+\.\d+)-[a-z]+/g)) {
      found.push(`${name}: php${minor}`);
      violations.push(`${name}: the apt package php${minor} has no exact release; use the php:${release} stage`);
    }
    if (/composer/.test(source) && !new RegExp(`^FROM composer:${composerRelease.replaceAll('.', '\\.')}@sha256:[0-9a-f]{64} AS composer$`, 'm').test(source)) violations.push(`${name}: Composer is not the recorded ${composerRelease} of its image`);
  }
  assert.ok(found.length > 0, 'no container definition installs PHP; the check reads the php stages and php8.N apt packages');
  assert.deepEqual(violations, [], `found: ${found.join(', ')}`);
});
