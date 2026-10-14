import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkedFiles } from '@polyspec/kit/tracked-files';
import { assertMachoArchitecture, machoArchitectures } from '../../scripts/php-extension-builder.mts';

const repository = fileURLToPath(new URL('../..', import.meta.url));

// Functions and classes of PHP extensions that a PHP build may leave out. A package that uses
// one must require the extension in composer.json; the core, PCRE, JSON and SPL are always present.
const optionalExtensions: [string, RegExp][] = [
  ['mbstring', /\bmb_[a-z_]+\s*\(/],
  ['ctype', /\bctype_[a-z]+\s*\(/],
  ['iconv', /\biconv(?:_[a-z_]+)?\s*\(/],
  ['intl', /\b(?:grapheme_[a-z_]+\s*\(|IntlChar\b|Normalizer\b|Collator\b|NumberFormatter\b)/],
  ['bcmath', /\bbc(?:add|sub|mul|div|mod|pow|sqrt|comp|scale|powmod)\s*\(/],
  ['gmp', /\bgmp_[a-z_]+\s*\(/],
  ['sodium', /\bsodium_[a-z_]+\s*\(/],
  ['dom', /\b(?:Dom\\|DOMDocument\b)/],
];

/** The PHP files of `directory` that Git tracks or does not ignore, as absolute paths. */
async function phpFiles(directory: string): Promise<string[]> {
  return checkedFiles(directory).filter(file => file.endsWith('.php')).map(file => path.join(directory, file));
}

/** Extensions a package's shipped PHP uses without requiring them. */
export async function undeclaredExtensions(packageDirectory: string): Promise<string[]> {
  const manifest = JSON.parse(await readFile(path.join(packageDirectory, 'composer.json'), 'utf8')) as { require?: Record<string, string> };
  const required = new Set(Object.keys(manifest.require ?? {}));
  const missing: string[] = [];
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
  // A Composer package lies at packages/<component> or at packages/<component>/<runtime> (C14.7).
  const packages = execFileSync('git', ['ls-files', '--', ':(glob)packages/*/composer.json', ':(glob)packages/*/*/composer.json'],
    { cwd: repository, encoding: 'utf8' }).split('\n').filter(Boolean).map((file) => path.join(repository, path.dirname(file)));
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
    execFileSync('git', ['init', '--quiet'], { cwd: directory });
    const missing = await undeclaredExtensions(directory);
    assert.deepEqual(missing.map((line) => line.split(': ')[1]), ['ext-mbstring', 'ext-ctype']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a PHP extension module has the architecture its PHP executable reports', async () => {
  const reports = (architecture: string) => async (executable: string, args: string[]) => {
    assert.equal(executable, '/usr/bin/lipo');
    assert.deepEqual(args, ['-archs', '/opt/php/bin/php']);
    return { stdout: architecture + '\n' };
  };
  assert.deepEqual(await machoArchitectures('/opt/php/bin/php', { run: reports('arm64') }), ['arm64']);
  await assertMachoArchitecture('/opt/php/bin/php', 'arm64', { run: reports('arm64') });
  await assert.rejects(
    assertMachoArchitecture('/opt/php/bin/php', 'arm64', { run: reports('x86_64') }),
    /x86_64/,
  );
});
