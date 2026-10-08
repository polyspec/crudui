import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkedFiles } from '../../scripts/kit/tracked-files.mjs';
import { assertMachoArchitecture, machoArchitectures } from '../../scripts/php-extension-builder.mjs';

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

/** The PHP files of `directory` that Git tracks or does not ignore, as absolute paths. */
async function phpFiles(directory) {
  return checkedFiles(directory).filter(file => file.endsWith('.php')).map(file => path.join(directory, file));
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
    execFileSync('git', ['init', '--quiet'], { cwd: directory });
    const missing = await undeclaredExtensions(directory);
    assert.deepEqual(missing.map((line) => line.split(': ')[1]), ['ext-mbstring', 'ext-ctype']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// The development root composer.json installs the validator as a copy into vendor/, so a target whose tests load that
// vendor directory refreshes the copy from source before them; otherwise the tests read a copy that an earlier run
// installed.
test('a make target whose tests load the root vendor reinstalls the validator copy first', async () => {
  const { makeTargets } = await import('../../scripts/test-commands.mjs');
  const targets = makeTargets(await readFile(path.join(repository, 'Makefile'), 'utf8'));
  const violations = [];
  for (const [name, rule] of Object.entries(targets)) {
    rule.commands.forEach((command, index) => {
      const files = /(?:run-tests|run-suite)\.mjs node(?: --timeout \d+)? -- (.+?)(?: \|\||;|$)/.exec(command)?.[1].split(/\s+/) ?? [];
      const reads = files.filter(file => file.endsWith('.mjs')).some(file => /vendor\/(autoload\.php|polyspec\/crudui-validator)/.test(readFileSync(path.join(repository, file), 'utf8')));
      const reinstalled = rule.commands.slice(0, index).some(line => line.includes('composer reinstall polyspec/crudui-validator'));
      if (reads && !reinstalled) violations.push(`${name}: \`${command}\` loads vendor/ without reinstalling polyspec/crudui-validator first`);
    });
  }
  assert.deepEqual(violations, []);
});

// Two runs of one checkout must not reinstall the root vendor directory at once, so every reinstall runs under the
// checkout lock of that directory.
test('every reinstall of the root vendor runs under its checkout lock', async () => {
  const { execFileSync } = await import('node:child_process');
  const files = execFileSync('git', ['ls-files', 'Makefile', '*.mjs', '*.yml', '*.sh'], { cwd: repository, encoding: 'utf8' }).split('\n').filter(Boolean);
  const violations = [];
  for (const file of files) {
    let source;
    try { source = readFileSync(path.join(repository, file), 'utf8'); } catch { continue; }
    // A reinstall and the hold of the lock that starts it, in the same command (the 300 characters before it).
    for (const match of source.matchAll(/reinstall['",\s]+polyspec\/crudui-validator/g)) {
      if (/\.test\.mjs$/.test(file)) continue;
      const statement = source.slice(Math.max(0, match.index - 300), match.index).split(/\bstep\(|\n\t/).at(-1);
      if (!/holder-lock\.mjs['"),\s]{0,6}run\b/.test(statement)) violations.push(`${file}: ${source.slice(match.index - 60, match.index + 30).replace(/\s+/g, ' ')}`);
    }
  }
  assert.deepEqual(violations, []);
});

test('a PHP extension module has the architecture its PHP executable reports', async () => {
  const reports = architecture => async (executable, args) => {
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
