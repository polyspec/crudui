import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../..', import.meta.url));

// Functions and classes of PHP extensions that a PHP build may leave out. A package that uses
// one must require the extension in composer.json; the core, PCRE, JSON and SPL are always present.
const optionalExtensions = [
  ['mbstring', /\bmb_[a-z_]+\s*\(/],
  ['ctype', /\bctype_[a-z]+\s*\(/],
  ['iconv', /\biconv(?:_[a-z_]+)?\s*\(/],
  ['intl', /\b(?:grapheme_[a-z_]+\s*\(|IntlChar\b|Normalizer\b|Collator\b|NumberFormatter\b)/],
  ['bcmath', /\bbc(?:add|sub|mul|div|mod|pow|sqrt|comp|scale|powmod)\s*\(/],
  ['gmp', /\bgmp_[a-z_]+\s*\(/],
  ['sodium', /\bsodium_[a-z_]+\s*\(/],
  ['dom', /\b(?:Dom\\|DOMDocument\b)/],
];

async function phpFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await phpFiles(full));
    else if (entry.name.endsWith('.php')) files.push(full);
  }
  return files;
}

/** Extensions a package's shipped PHP uses without requiring them. */
export async function undeclaredExtensions(packageDirectory) {
  const manifest = JSON.parse(await readFile(path.join(packageDirectory, 'composer.json'), 'utf8'));
  const required = new Set(Object.keys(manifest.require ?? {}));
  const missing = [];
  for (const file of await phpFiles(path.join(packageDirectory, 'src'))) {
    const source = (await readFile(file, 'utf8')).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    for (const [extension, pattern] of optionalExtensions) {
      if (pattern.test(source) && !required.has(`ext-${extension}`)) {
        missing.push(`${path.relative(repository, file)}: ext-${extension}`);
      }
    }
  }
  return missing;
}

test('every published PHP package requires the optional extensions its source uses', async () => {
  const packages = (await readdir(path.join(repository, 'packages'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory()).map((entry) => path.join(repository, 'packages', entry.name));
  let checked = 0;
  for (const directory of packages) {
    try {
      await readFile(path.join(directory, 'composer.json'));
    } catch {
      continue;
    }
    checked++;
    assert.deepEqual(await undeclaredExtensions(directory), [], path.relative(repository, directory));
  }
  assert.ok(checked >= 2, 'the PHP packages are found');
});

test('an optional extension used without its requirement is reported', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-php-extensions-'));
  try {
    await mkdir(path.join(directory, 'src'));
    await writeFile(path.join(directory, 'composer.json'), JSON.stringify({ require: { php: '^8.4' } }));
    await writeFile(path.join(directory, 'src/Name.php'), '<?php\n// ctype_alpha($x) in a comment is ignored\nreturn ctype_digit($name[0]) && mb_strlen($name) > 0;\n');
    const missing = await undeclaredExtensions(directory);
    assert.deepEqual(missing.map((line) => line.split(': ')[1]), ['ext-mbstring', 'ext-ctype']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
