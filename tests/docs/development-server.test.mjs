import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../../scripts/docs-site/cli.mjs', import.meta.url), 'utf8',
);

test('documentation development rebuilds use file-system events', () => {
  assert.equal(source.includes('setInterval'), false,
    'documentation development must not use a periodic timer');
  assert.equal(source.includes('snapshot('), false,
    'documentation development must not scan every source file periodically');
  assert.match(source, /watchDocumentation/,
    'documentation development must subscribe to source changes');
});
