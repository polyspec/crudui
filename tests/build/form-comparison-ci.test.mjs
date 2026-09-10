import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const repository = path.resolve(import.meta.dirname, '../..');

function workflowJob(source, name) {
  const lines = source.split('\n');
  const start = lines.findIndex(line => line === `  ${name}:`);
  assert.notEqual(start, -1, `CI must define the ${name} job`);
  const endOffset = lines.slice(start + 1).findIndex(line => /^  [a-z0-9-]+:$/.test(line));
  const end = endOffset === -1 ? lines.length : start + 1 + endOffset;
  return lines.slice(start, end).join('\n');
}

test('CI runs the complete form comparison regression suite', async () => {
  const workflow = await readFile(path.join(repository, '.github/workflows/ci.yml'), 'utf8');
  const job = workflowJob(workflow, 'form-comparison');

  assert.match(job, /runs-on:s*ubuntu-latest/);
  assert.match(job, /uses: actions\/checkout@/);
  assert.match(job, /uses: actions\/setup-node@/);
  assert.match(job, /node-version-file:s*['"]?\.node-version['"]?/);
  assert.match(job, /npm i -g npm@latest && npm ci/);
  assert.match(job, /run:s*npm run test:form-comparison(?:\s|$)/);
});
