import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

import { isVendored, ownedFiles } from '../../scripts/repository-files.mts';
import { makeDryRun } from './make-dry-run.mts';

const repository = fileURLToPath(new URL('../..', import.meta.url));

/** The parts of a workflow step that the tests read. */
interface WorkflowStep {
  run?: unknown;
  uses?: unknown;
  with?: Record<string, string>;
}

/** The text of a step's `uses` or `run`: empty when the step has none; a value that is not text fails the test. */
function stepText(step: WorkflowStep, member: 'uses' | 'run'): string {
  const value = step[member];
  if (value === undefined) return '';
  assert.ok(typeof value === 'string', `a step's ${member} is text: ${JSON.stringify(value)}`);
  return value;
}

/** The parts of a workflow job that the tests read. */
interface WorkflowJob {
  'runs-on'?: string;
  steps?: WorkflowStep[];
  strategy?: { matrix?: { php?: unknown[] } };
}

/** The parts of a workflow file that the tests read. */
interface Workflow {
  env?: Record<string, string>;
  jobs: Record<string, WorkflowJob>;
}

/** The parts of a package.json that the tests read. */
interface Manifest {
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** The parts of config/toolchain.json that the tests read. */
interface ToolchainConfig {
  node: Record<string, string>;
  php: string[];
}

/** The releases that recordedToolchain reads. */
interface RecordedToolchain {
  node: string;
  npm: string | undefined;
  go: string | undefined;
  rust: string | undefined;
  php: string[];
  python: string | undefined;
  composer: string | undefined;
}

/**
 * The releases that the checkout declares, by the names of this test: Node.js of .node-version, npm of packageManager,
 * Rust of rust-toolchain.toml, the minors of PHP of config/toolchain.json, and Go, Python and Composer of mise.toml, which
 * make install-tools installs with mise (kit K127). make toolchain-check compares them with the running tools and with the
 * pins of kit.
 */
async function recordedToolchain(root: string): Promise<RecordedToolchain> {
  const text = (file: string): Promise<string> => readFile(path.join(root, file), 'utf8');
  const config = JSON.parse(await text('config/toolchain.json')) as ToolchainConfig;
  const manifest = JSON.parse(await text('package.json')) as Manifest;
  const mise = await text('mise.toml');
  return {
    node: (await text('.node-version')).trim(),
    npm: /^npm@(\d+\.\d+\.\d+)/.exec(manifest.packageManager ?? '')?.[1],
    go: /^go = "([^"]+)"$/m.exec(mise)?.[1],
    rust: /^channel = "([^"]+)"$/m.exec(await text('rust-toolchain.toml'))?.[1],
    php: config.php, python: /^python = "([^"]+)"$/m.exec(mise)?.[1], composer: /^"http:composer" = \{ version = "([^"]+)"/m.exec(mise)?.[1],
  };
}

/** The container definitions of the checkout: Dockerfile and *Containerfile among its tracked files. */
async function findContainerDefinitions(): Promise<string[]> {
  return ownedFiles(repository).filter(file => /(?:^|\/)(?:Dockerfile|[^/]*Containerfile)$/.test(file)).map(file => path.join(repository, file));
}

/** The exact npm release that `packageManager` of package.json records. */
async function recordedNpm(): Promise<string | undefined> {
  const manifest = JSON.parse(await readFile(path.join(repository, 'package.json'), 'utf8')) as Manifest;
  const match = /^npm@(\d+\.\d+\.\d+)$/.exec(manifest.packageManager ?? '');
  assert.ok(match, `package.json must record one exact npm release as packageManager npm@<major>.<minor>.<patch>; it records ${manifest.packageManager}`);
  return match[1];
}

test('the npm that runs here is the release that package.json records', async () => {
  const recorded = await recordedNpm();
  const running = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'], { encoding: 'utf8' });
  assert.equal(running.error, undefined, running.error?.message ?? '');
  assert.equal(running.stdout.trim(), recorded,
    `npm ${running.stdout.trim()} runs here and package.json records npm ${recorded}; fix: make install-tools installs it into var/tools, and make puts var/tools/bin first on PATH`);
});

test('every workflow job installs the recorded npm before it runs npm', async () => {
  await recordedNpm();
  const directory = path.join(repository, '.github/workflows');
  const violations: string[] = [];
  for (const file of (await readdir(directory)).filter(name => /\.ya?ml$/.test(name))) {
    const workflow = parse(await readFile(path.join(directory, file), 'utf8')) as Partial<Workflow>;
    for (const [id, job] of Object.entries(workflow.jobs ?? {})) {
      let installed = false;
      for (const step of job.steps ?? []) {
        if (typeof step.run !== 'string') continue;
        for (const command of step.run.split(/\n|&&/).map(text => text.trim()).filter(Boolean)) {
          if (/\bnpm@|\bnpm (?:i|install) (?:-g|--global)\b/.test(command)) violations.push(`${file} ${id}: \`${command}\` selects an npm release`);
          // make install-tools TOOLS="npm" installs the recorded npm, and make install-packages runs it.
          if (/^make\b.*\binstall-(?:tools|packages)\b/.test(command)) installed = true;
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

const read = (file: string): Promise<string> => readFile(path.join(repository, file), 'utf8');

/** Every workflow file of this repository with its parsed content; the copy of kit, release.yml, follows the rules of kit. */
async function workflows(): Promise<{ file: string; text: string; workflow: Workflow }[]> {
  const directory = path.join(repository, '.github/workflows');
  return Promise.all((await readdir(directory)).filter(name => /\.ya?ml$/.test(name) && !isVendored(`.github/workflows/${name}`)).map(async file => ({ file, text: await read(`.github/workflows/${file}`), workflow: parse(await read(`.github/workflows/${file}`)) as Workflow })));
}

test('the checkout records one exact version of every tool', async () => {
  const recorded = await recordedToolchain(repository);
  assert.match(recorded.node, /^\d+\.\d+\.\d+$/);
  assert.equal(Number(recorded.node.split('.')[0]) % 2, 0, 'the Node.js release must be of an even, LTS-designated major');
  const toolchain = await read('rust-toolchain.toml');
  assert.match(toolchain, /^profile = "minimal"$/m);
  assert.match(toolchain, /^components = \["rustfmt", "clippy"\]$/m);
  const config = JSON.parse(await read('config/toolchain.json')) as ToolchainConfig;
  assert.match(config.node['linux-x64.tar.gz'] ?? '', /^[0-9a-f]{64}$/, 'config/toolchain.json records the SHA-256 of the Linux x64 archive of the Node.js release');
  // setup-php and Homebrew cannot install the same patch, so PHP is pinned by its minor release; the patch is evidence.
  assert.ok(config.php.length > 0 && config.php.every(release => /^\d+\.\d+$/.test(release)), `config/toolchain.json must record php as minor releases; it records ${JSON.stringify(config.php)}`);
  // Python, a test tool of tests/ordered-json, and Go and Composer are exact releases of mise.toml, locked by mise.lock.
  for (const tool of ['go', 'python', 'composer'] as const) assert.match(recorded[tool] ?? '', /^\d+\.\d+\.\d+$/, `mise.toml must record ${tool} as one exact release`);
});

// The type definitions of Node.js describe the runtime that runs the code, so every manifest requires the major of
// the recorded Node.js release.
test('every @types/node range requires the major of .node-version', async () => {
  const major = (await recordedToolchain(repository)).node.split('.')[0];
  const files = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*package.json'], { cwd: repository, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  const violations: string[] = [];
  for (const file of files) {
    let manifest: Manifest;
    try { manifest = JSON.parse(await read(file)) as Manifest; } catch { continue; }
    for (const field of ['dependencies', 'devDependencies'] as const) {
      const range = manifest[field]?.['@types/node'];
      if (range !== undefined && !new RegExp(`^[\\^~]?${major}\\.`).test(range)) violations.push(`${file} ${field}: @types/node ${range}, .node-version records Node.js ${major}`);
    }
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
  const violations: string[] = [];
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

/** The PHP minors of the matrix of a job whose setup-php step reads `${{ matrix.php }}`. */
function phpMatrix(job: WorkflowJob): string[] {
  const php = job.strategy?.matrix?.php;
  assert.ok(php, 'a job whose setup-php reads ${{ matrix.php }} declares strategy.matrix.php');
  return php.map(String);
}

// The tools of mise.toml that the jobs check; make install-tools installs every tool of mise.lock.
const MISE_TOOLS = ['go', 'python', 'composer'] as const;
const MISE: readonly string[] = MISE_TOOLS;

test('every CI job sets up the recorded toolchains and checks the tools it set up', async () => {
  const recorded = await recordedToolchain(repository);
  for (const tool of MISE_TOOLS) assert.ok(recorded[tool], `mise.toml declares ${tool}`);
  const minors = recorded.php;
  const violations: string[] = [];
  for (const { file, workflow } of await workflows()) {
    for (const [id, job] of Object.entries(workflow.jobs)) {
      const steps = job.steps ?? [];
      if (!steps.some(step => stepText(step, 'uses').startsWith('actions/checkout@'))) continue;
      const tools = ['node'];
      let checked: { tools: string[]; index: number } | undefined;
      for (const [index, step] of steps.entries()) {
        const uses = stepText(step, 'uses');
        const run = stepText(step, 'run');
        if (uses.startsWith('actions/setup-node@') && step.with?.['node-version-file'] !== '.node-version') violations.push(`${file} ${id}: setup-node must read .node-version`);
        if (uses.startsWith('actions/setup-go@')) violations.push(`${file} ${id}: setup-go installs a Go; make install-tools installs the Go of mise.toml`);
        if (uses.startsWith('actions/setup-python@')) violations.push(`${file} ${id}: setup-python installs a Python; make install-tools installs the Python of mise.toml`);
        if (uses.startsWith('shivammathur/setup-php@')) {
          tools.push('php');
          const versions = step.with?.['php-version'] === '${{ matrix.php }}' ? phpMatrix(job) : [String(step.with?.['php-version'])];
          for (const version of versions) if (!minors.includes(version)) violations.push(`${file} ${id}: PHP ${version} is not a minor of config/toolchain.json`);
          if (step.with?.tools !== 'none') violations.push(`${file} ${id}: setup-php installs ${step.with?.tools}; it installs PHP alone, and make install-tools installs the Composer of mise.toml`);
        }
        if (/^make install-tools$/m.test(run)) tools.push(...MISE);
        if (/rust-toolchain|dtolnay/.test(uses)) violations.push(`${file} ${id}: ${uses} selects a Rust toolchain; run rustup toolchain install --no-self-update`);
        if (/^make\b.*\binstall-rust\b/m.test(run)) tools.push('rust');
        if (/^make\b.*\binstall-(?:tools|packages)\b/m.test(run) && !tools.includes('npm')) tools.push('npm');
        const check = /^make toolchain-check TOOLS=(?:"([^"]+)"|(\S+))$/m.exec(run);
        const listed = check?.[1] ?? check?.[2];
        if (listed !== undefined) checked = { tools: listed.split(' '), index };
      }
      // A job checks every tool that it set up outside mise, and the tools of mise that it checks are installed.
      if (!checked) violations.push(`${file} ${id}: no step runs make toolchain-check`);
      else {
        const unchecked = tools.filter(tool => !MISE.includes(tool) && !checked.tools.includes(tool));
        const missing = checked.tools.filter(tool => !tools.includes(tool));
        if (unchecked.length || missing.length) violations.push(`${file} ${id}: checks ${checked.tools.join(' ')}, sets up ${tools.join(' ')}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('no browser of a release channel or of the machine is installed or launched', async () => {
  const files = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'scripts', 'tests', '.github', 'Makefile'], { cwd: repository, encoding: 'utf8' }).stdout.split('\n').filter(file => file && !file.endsWith('runtime-version-policy.test.mts'));
  const violations: string[] = [];
  for (const file of files) {
    let source: string;
    try { source = await read(file); } catch { continue; }
    source.split('\n').forEach((line, index) => {
      if (/browsers install \S+@(?:stable|latest|beta|dev|canary)\b|\/opt\/google\/chrome|\/Applications\/Firefox|\/usr\/bin\/firefox|CRUDUI_FIREFOX_EXECUTABLE/.test(line)) violations.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(violations, []);
});

test('the declared contract commands run in a shell without login files', async () => {
  const runner = await read('scripts/run-contract-tests.mts');
  assert.match(runner, /args: \['-c', command\]/);
  assert.doesNotMatch(runner, /'-lc'|'-l'/);
});

// make toolchain-check requires require.php of every composer.json to be >= the PHP pin of kit, and config/toolchain.json php
// to be that pin; every job that runs the test suite of a PHP package runs it on each of those minors.
test('every job that tests a PHP package runs on each PHP minor of config/toolchain.json', async () => {
  const workflow = parse(await readFile(path.join(repository, '.github/workflows/ci.yml'), 'utf8')) as Workflow;
  const minors = (await recordedToolchain(repository)).php;
  const jobs = Object.entries(workflow.jobs).filter(([, job]) => /composer --working-dir=packages\/[^ ]+ test\b|make (?:ci-targets TARGETS="[^"]*\b)?test-(?:native|php-api|validator-php)(?=[\s"])/
    .test((job.steps ?? []).map(step => stepText(step, 'run')).join('\n')));
  assert.ok(jobs.length > 0, 'no CI job tests a PHP package');
  for (const [name, job] of jobs) assert.deepEqual(job.strategy?.matrix?.php?.map(String), minors, `${name} tests a PHP package`);
});
