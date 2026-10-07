import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('includes the browser process check only in the complete runtime suite', async () => {
  const packageJson = JSON.parse(await readFile(
    new URL('../../package.json', import.meta.url), 'utf8'));
  const scripts = packageJson.scripts;
  // Every suite of the complete runtime suite runs after an earlier one failed, and each builds the packages it reads.
  assert.equal(scripts['test:form-comparison'],
    'status=0; npm run test:form-comparison:source || status=1; npm run test:form-comparison:library || status=1; '
    + 'npm run test:form-comparison:browser || status=1; exit $status');
  for (const name of ['source', 'library', 'browser']) {
    assert.ok(scripts[`test:form-comparison:${name}`].startsWith('node scripts/require-current-build.mjs && '), name);
  }
  assert.ok(scripts['test:form-comparison:source'].includes('src/*.test.mjs'));
  assert.doesNotMatch(scripts['test:form-comparison:source'], /browser-job\.browser\.mjs|prepare\.test\.mjs/);
  assert.equal(scripts['test:form-comparison:browser'],
    'node scripts/require-current-build.mjs && node scripts/run-tests.mjs node -- examples/form-comparison/src/browser-job.browser.mjs');
});

test('generation fixtures use the canonical operating system temporary directory', async () => {
  const source = await readFile(
    new URL('./generation-performance.test.mjs', import.meta.url), 'utf8',
  );
  assert.match(source, /realpathSync\(tmpdir\(\)\)/);
  assert.match(source, /lstatSync\(current\)/);
  assert.match(source, /state\.isSymbolicLink\(\)/);
  assert.doesNotMatch(source, /path\.join\(library, ['"]\.git\//);
});
