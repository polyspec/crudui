// The checks of the checkout read its files through checkedFiles of @polyspec/kit/tracked-files: tracked files and new
// files that Git does not ignore. No check walks the tree with its own list of skipped directory names.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { checkedFiles } from '@polyspec/kit/tracked-files';

const ROOT = path.resolve(import.meta.dirname, '../..');

test('no check walks the tree with its own list of skipped directory names', () => {
  const violations = [];
  for (const file of checkedFiles(ROOT).filter(name => /\.(?:mjs|js|ts)$/.test(name))) {
    const source = readFileSync(path.join(ROOT, file), 'utf8');
    source.split('\n').forEach((line, index) => {
      if (/new Set\(\[[^\]]*'node_modules'/.test(line)) violations.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(violations, [], 'read the files of the checkout through checkedFiles of @polyspec/kit/tracked-files');
});
