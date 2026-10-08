import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

import { toolchainMismatches } from '../../scripts/kit/check-toolchain.mjs';
import { declaredToolchain } from '../../scripts/kit/toolchain-declared.mjs';
import { ownedFiles } from '../../scripts/repository-files.mjs';
import { makeDryRun } from './make-dry-run.mjs';

const repository = fileURLToPath(new URL('../..', import.meta.url));

/** The releases that the checkout declares, by the names of this test: node, npm, go, rust, composer and the minors of php and python. */
function recordedToolchain(root) {
  const declared = declaredToolchain(root);
  return {
    node: declared.node.version, npm: declared.npm.version, go: declared.go.version, rust: declared.rust.version,
    php: declared.php.minors, python: declared.python.minor, composer: declared.composer.version,
  };
}

/** The container definitions of the checkout: Dockerfile and *Containerfile among its tracked files. */
async function findContainerDefinitions() {
  return ownedFiles(repository).filter(file => /(?:^|\/)(?:Dockerfile|[^/]*Containerfile)$/.test(file)).map(file => path.join(repository, file));
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
    `npm ${running.stdout.trim()} runs here and package.json records npm ${recorded}; fix: make install-tools installs it into var/tools, and make puts var/tools/bin first on PATH`);
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
          // make install-tools installs the recorded npm, and make install-node-modules runs it first (its prerequisite).
          if (/^make\b.*\binstall-(?:tools|node-modules)\b/.test(command)) installed = true;
          else if (/^npm\b/.test(command) && !installed) violations.push(`${file} ${id}: \`${command}\` runs before make install-tools`);
        }
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('the checkout tracks no container definition: Linux runs on the CI runners', async () => {
  assert.deepEqual((await findContainerDefinitions()).map(file => path.relative(repository, file)), []);
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
  const go = (await read('.go-version')).trim();
  assert.equal(recordedToolchain(repository).go, go, 'config/toolchain.json go names a go.mod whose toolchain line is the release of .go-version');
  const files = ownedFiles(repository).filter(file => /(?:^|\/)go\.mod$/.test(file));
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
  const pyproject = await readFile(path.join(repository, 'packages/validator-python/pyproject.toml'), 'utf8');
  const pythonMinimum = /^requires-python = ">=(\d+\.\d+)"$/m.exec(pyproject)?.[1];
  assert.ok(pythonMinimum, 'packages/validator-python/pyproject.toml names requires-python = ">=X.Y"');
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
          const versions = step.with?.['python-version'] === '${{ matrix.python }}' ? job.strategy.matrix.python.map(String) : [String(step.with?.['python-version'])];
          if (!versions.includes(recorded.python)) violations.push(`${file} ${id}: setup-python must install the recorded minor ${recorded.python}`);
          for (const version of versions) {
            if (version !== recorded.python && version !== pythonMinimum) violations.push(`${file} ${id}: setup-python installs ${version}, which is neither the recorded minor ${recorded.python} nor the minimum ${pythonMinimum} of requires-python`);
          }
        }
        if (/rust-toolchain|dtolnay/.test(uses)) violations.push(`${file} ${id}: ${uses} selects a Rust toolchain; run rustup toolchain install --no-self-update`);
        if (/^make\b.*\binstall-rust\b/m.test(run)) tools.push('rust');
        if (/^make\b.*\binstall-(?:tools|node-modules)\b/m.test(run) && !tools.includes('npm')) tools.push('npm');
        const check = /^make toolchain-check TOOLS=(?:"([^"]+)"|(\S+))$/m.exec(run);
        if (check) checked = { tools: (check[1] ?? check[2]).split(' '), index };
      });
      if (!checked) violations.push(`${file} ${id}: no step runs make toolchain-check`);
      else if ([...checked.tools].sort().join(' ') !== [...tools].sort().join(' ')) violations.push(`${file} ${id}: checks ${checked.tools.join(' ')}, sets up ${tools.join(' ')}`);
    }
  }
  assert.deepEqual(violations, []);
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
  return ownedFiles(repository).filter(file => /(?:^|\/)composer\.json$/.test(file)).map(file => path.join(repository, file));
}

/** The PHP minors from `lowest` to `newest`, as `8.N` strings. */
function phpMinors(lowest, newest) {
  const [lowMajor, lowMinor] = lowest.split('.').map(Number);
  const [highMajor, highMinor] = newest.split('.').map(Number);
  assert.equal(lowMajor, highMajor, 'The supported PHP range must stay within one major');
  return Array.from({ length: highMinor - lowMinor + 1 }, (_, i) => `${lowMajor}.${lowMinor + i}`);
}

test('the declared PHP range is the range CI tests, and config/toolchain.json records its newest line', async () => {
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
  assert.ok(recordedToolchain(repository).php.includes(newest), `config/toolchain.json does not record the newest tested minor ${newest}`);
});
