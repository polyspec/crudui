import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const documents = await Promise.all([
  '../../docs/operations/verification.md',
  '../../docs/operations/verification.ko.md',
].map(async file => [file, await readFile(new URL(file, import.meta.url), 'utf8')]));

test('verification procedure deploys and verifies the mounted repository tree', () => {
  for (const [file, source] of documents) {
    const commands = [...source.matchAll(/^```sh\n([\s\S]*?)^```/gm)]
      .map(match => match[1]).join('\n');
    assert.match(commands, /^make deploy$/m,
      `${file}: the procedure must apply the mounted-source deployment`);
    assert.match(commands, /^make deploy-verify$/m,
      `${file}: the procedure must verify the mounted tree in the running container`);
    assert.ok(commands.indexOf('make deploy\n') < commands.indexOf('make deploy-verify'),
      `${file}: the container must run before it is verified`);
    assert.doesNotMatch(commands,
      /candidate-verification\.mjs|prepare\.mjs|--ref|--commit|CANDIDATE_|container build/,
      `${file}: the procedure must not build or pin per-commit candidates`);
    assert.equal(commands.includes('sleep '), false,
      `${file}: the procedure must not poll readiness with sleep`);
    assert.equal(commands.includes('for attempt in'), false,
      `${file}: the procedure must not retry readiness reads`);
  }
});
