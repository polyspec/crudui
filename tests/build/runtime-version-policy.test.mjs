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

test('CI selects the current Node.js LTS and npm stable channels', async () => {
  const workflow = await readFile(path.join(repository, '.github/workflows/ci.yml'), 'utf8');
  const setupCount = [...workflow.matchAll(/uses: actions\/setup-node@/g)].length;
  const ltsCount = [...workflow.matchAll(/node-version:\s*['"]lts\/\*['"]/g)].length;
  assert.ok(setupCount > 0, 'CI must configure Node.js');
  assert.equal(ltsCount, setupCount, 'Every setup-node step must select lts/*');
  assert.doesNotMatch(workflow, /npm@\d+(?:\.\d+)*/);
  assert.match(workflow, /npm@latest/);
});

test('container definitions select the current Node.js LTS channel', async () => {
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
    nodeStages.filter(stage => !stage.tag.startsWith('lts-')),
    [],
    `Node.js stages must use lts tags: ${JSON.stringify(nodeStages, null, 2)}`,
  );
});
