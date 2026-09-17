import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const ignoredDirectories = new Set(['.git', 'node_modules', 'target', 'vendor']);

async function findContainerDefinitions(directory = repository) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()
      && !entry.name.startsWith('.')
      && !ignoredDirectories.has(entry.name)) {
      files.push(...await findContainerDefinitions(path.join(directory, entry.name)));
    } else if (entry.isFile()
      && (entry.name === 'Dockerfile' || entry.name.endsWith('Containerfile'))) {
      files.push(path.join(directory, entry.name));
    }
  }
  return files;
}

async function selectedNodeMajor() {
  const value = (await readFile(path.join(repository, '.node-version'), 'utf8')).trim();
  assert.match(value, /^\d+$/, '.node-version must contain one Node.js major');
  const major = Number(value);
  assert.equal(major % 2, 0, 'The selected Node.js major must be an LTS-designated line');
  return value;
}

async function selectedGoRelease() {
  const value = (await readFile(path.join(repository, '.go-version'), 'utf8')).trim();
  assert.match(value, /^\d+\.\d+$/,
    '.go-version must contain one Go major and minor release');
  return value;
}

test('CI selects the tracked Node.js line and current npm stable channel', async () => {
  const workflow = await readFile(path.join(repository, '.github/workflows/ci.yml'), 'utf8');
  const setupCount = [...workflow.matchAll(/uses: actions\/setup-node@/g)].length;
  const versionFileCount = [...workflow.matchAll(/node-version-file:\s*['"]?\.node-version['"]?/g)]
    .length;
  assert.ok(setupCount > 0, 'CI must configure Node.js');
  assert.equal(versionFileCount, setupCount,
    'Every setup-node step must read .node-version');
  assert.doesNotMatch(workflow, /node-version:\s*['"]?\d/);
  assert.doesNotMatch(workflow, /npm@\d+(?:\.\d+)*/);
  assert.match(workflow, /npm@latest/);
});

test('container definitions select the tracked Node.js major channel', async () => {
  const major = await selectedNodeMajor();
  const definitions = await findContainerDefinitions();
  const nodeStages = [];
  for (const definition of definitions) {
    const source = await readFile(definition, 'utf8');
    for (const match of source.matchAll(/^FROM\s+node:([^\s]+)(?:\s|$)/gm)) {
      nodeStages.push({ definition: path.relative(repository, definition), tag: match[1] });
    }
  }
  assert.ok(nodeStages.length > 0, 'At least one Node.js container stage is required');
  assert.deepEqual(
    nodeStages.filter(stage => !stage.tag.startsWith(`${major}-`)),
    [],
    `Node.js stages must use the ${major} major channel: ${JSON.stringify(nodeStages, null, 2)}`,
  );
});

test('CI selects the tracked Go release line', async () => {
  const workflow = await readFile(path.join(repository, '.github/workflows/ci.yml'), 'utf8');
  const setupCount = [...workflow.matchAll(/uses: actions\/setup-go@/g)].length;
  const versionFileCount = [...workflow.matchAll(/go-version-file:\s*['"]?\.go-version['"]?/g)]
    .length;
  assert.ok(setupCount > 0, 'CI must configure Go');
  assert.equal(versionFileCount, setupCount,
    'Every setup-go step must read .go-version');
  assert.doesNotMatch(workflow, /go-version:\s*['"]?\d/);
});

test('container definitions select the tracked Go release line', async () => {
  const release = await selectedGoRelease();
  const definitions = await findContainerDefinitions();
  const goStages = [];
  for (const definition of definitions) {
    const source = await readFile(definition, 'utf8');
    for (const match of source.matchAll(/^FROM\s+golang:([^\s]+)(?:\s|$)/gm)) {
      goStages.push({ definition: path.relative(repository, definition), tag: match[1] });
    }
  }
  assert.ok(goStages.length > 0, 'At least one Go container stage is required');
  assert.deepEqual(
    goStages.filter(stage => !stage.tag.startsWith(`${release}-`)),
    [],
    `Go stages must use the ${release} release line: ${JSON.stringify(goStages, null, 2)}`,
  );
});

test('CI selects the stable Rust toolchain channel', async () => {
  const workflow = await readFile(path.join(repository, '.github/workflows/ci.yml'), 'utf8');
  const setupCount = [...workflow.matchAll(/uses: dtolnay\/rust-toolchain@/g)].length;
  const stableCount = [...workflow.matchAll(/uses: dtolnay\/rust-toolchain@stable/g)].length;
  assert.ok(setupCount > 0, 'CI must configure Rust');
  assert.equal(stableCount, setupCount,
    'Every Rust toolchain step must select the stable channel');
});

test('container definitions select the stable Rust major channel', async () => {
  const definitions = await findContainerDefinitions();
  const rustStages = [];
  for (const definition of definitions) {
    const source = await readFile(definition, 'utf8');
    for (const match of source.matchAll(/^FROM\s+rust:([^\s]+)(?:\s|$)/gm)) {
      rustStages.push({ definition: path.relative(repository, definition), tag: match[1] });
    }
  }
  assert.ok(rustStages.length > 0, 'At least one Rust container stage is required');
  assert.deepEqual(
    rustStages.filter(stage => !stage.tag.startsWith('1-')),
    [],
    `Rust stages must use the stable major channel: ${JSON.stringify(rustStages, null, 2)}`,
  );
});

async function composerManifests(directory = repository) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.') && !ignoredDirectories.has(entry.name)) {
      files.push(...await composerManifests(path.join(directory, entry.name)));
    } else if (entry.isFile() && entry.name === 'composer.json') {
      files.push(path.join(directory, entry.name));
    }
  }
  return files;
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

  const stages = [];
  for (const definition of await findContainerDefinitions()) {
    const source = await readFile(definition, 'utf8');
    for (const match of source.matchAll(/^FROM\s+php:([^\s]+)(?:\s|$)/gm)) {
      stages.push({ definition: path.relative(repository, definition), tag: match[1] });
    }
  }
  assert.deepEqual(stages.filter((stage) => !stage.tag.startsWith(`${newest}-`)), [],
    `PHP container stages must use the newest tested line ${newest}`);
});
