import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (file) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
const dates = (text) => [...text.matchAll(/^## (\d{4}-\d{2}-\d{2}) — /gm)].map((match) => match[1]);

test('every change entry has a Korean entry at the same position', async () => {
  const english = dates(await read('CHANGELOG.md'));
  const korean = dates(await read('CHANGELOG.ko.md'));
  assert.ok(english.length > 0, 'CHANGELOG.md has dated entries');
  assert.deepEqual(korean, english, 'CHANGELOG.ko.md must list the same dated entries in the same order');
});

test('change entries are newest first', async () => {
  const english = dates(await read('CHANGELOG.md'));
  const misplaced = english.filter((date, index) => index > 0 && date > english[index - 1]);
  assert.deepEqual(misplaced, [], 'an entry is newer than the entry above it');
});

test('every heading of a change log is a dated entry', async () => {
  for (const file of ['CHANGELOG.md', 'CHANGELOG.ko.md']) {
    const headings = (await read(file)).match(/^## .*$/gm) ?? [];
    assert.deepEqual(headings.filter((heading) => !/^## \d{4}-\d{2}-\d{2} — \S/.test(heading)), [], file);
  }
});
