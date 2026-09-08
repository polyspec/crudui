import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { repositoryLink } from './documentation-links.mjs';

const root = mkdtempSync(join(tmpdir(), 'crudui-documentation-links-'));
mkdirSync(join(root, 'docs'));
mkdirSync(join(root, 'tests'));
writeFileSync(join(root, 'tests', 'build notes.md'), '# Build notes');
const source = join(root, 'docs', 'features.md');
after(() => rmSync(root, { recursive: true }));

test('site links remain available to the normal site link checker', () => {
  assert.equal(repositoryLink('./spec/missing.md', source, root), './spec/missing.md');
});

test('existing repository files use source URLs with their anchors', () => {
  assert.equal(repositoryLink('../tests/build%20notes.md#checks', source, root),
    'https://github.com/crudui/crudui/blob/main/tests/build%20notes.md#checks');
});

test('repository directories use directory URLs', () => {
  assert.equal(repositoryLink('../tests/', source, root),
    'https://github.com/crudui/crudui/tree/main/tests');
});

test('missing repository files fail instead of bypassing validation', () => {
  assert.throws(() => repositoryLink('../tests/missing.md', source, root), /Invalid repository link/);
  assert.throws(() => repositoryLink('../../outside.md', source, root), /Invalid repository link/);
});

test('external links and anchors are unchanged', () => {
  for (const href of ['https://example.com/page', '#details']) {
    assert.equal(repositoryLink(href, source, root), href);
  }
});
