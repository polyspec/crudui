// The checks of the checkout read its files through checkedFiles of @polyspec/kit/tracked-files: tracked files and new
// files that Git does not ignore. No check walks the tree with its own list of skipped directory names.
import assert from 'node:assert/strict';
import { closeSync, openSync, readFileSync, readSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { checkedFiles } from '@polyspec/kit/tracked-files';

const ROOT = path.resolve(import.meta.dirname, '../..');

test('no check walks the tree with its own list of skipped directory names', () => {
  const violations: string[] = [];
  for (const file of checkedFiles(ROOT).filter(name => /\.(?:mjs|mts|js|ts)$/.test(name))) {
    const source = readFileSync(path.join(ROOT, file), 'utf8');
    source.split('\n').forEach((line, index) => {
      if (/new Set\(\[[^\]]*'node_modules'/.test(line)) violations.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(violations, [], 'read the files of the checkout through checkedFiles of @polyspec/kit/tracked-files');
});

// The magic numbers of the executables that a build writes: Mach-O (32 and 64 bit, both byte orders, and universal), ELF and
// PE. A build writes its program into var/, so a tracked file never starts with one.
const EXECUTABLE_MAGIC = ['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe', '7f454c46', '4d5a'];

/** The first four bytes of `file` as hexadecimal. */
function head(file: string): string {
  const descriptor = openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(4);
    const read = readSync(descriptor, buffer, 0, 4, 0);
    return buffer.subarray(0, read).toString('hex');
  } finally {
    closeSync(descriptor);
  }
}

test('no tracked file is a compiled executable', () => {
  const executables = checkedFiles(ROOT).filter(file => {
    const bytes = head(path.join(ROOT, file));
    return EXECUTABLE_MAGIC.some(magic => bytes.startsWith(magic));
  });
  assert.deepEqual(executables, [], 'a build writes its program into var/; remove the tracked executables');
});
