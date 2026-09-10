import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

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
