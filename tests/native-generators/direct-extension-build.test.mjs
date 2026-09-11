import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

import { requiredSourcePaths } from '../../examples/form-comparison/prepare.mjs';

const root = new URL('../../', import.meta.url);
const files = Object.fromEntries(await Promise.all([
  '.dockerignore',
  'Makefile',
  'examples/form-comparison/Containerfile',
  'tests/containers/native.Containerfile',
  'packages/php-ext/README.md',
  'packages/php-ext/README.ko.md',
  'scripts/build-crudui-php-extension.mjs',
].map(async filename => [filename, await readFile(new URL(filename, root), 'utf8')])));

function normalized(source) {
  return source.replace(/\s+/g, ' ');
}

test('PHP modules use the shared builder through explicit entry points', async () => {
  const common = 'scripts/php-extension-builder.mjs';
  const crudui = 'scripts/build-crudui-php-extension.mjs';
  const orderedJson = 'scripts/build-ordered-json-php-extension.mjs';
  for (const filename of [common, crudui, orderedJson]) {
    await access(new URL(filename, root));
    assert.ok(requiredSourcePaths.includes(filename),
      'Candidate source checks must require ' + filename);
  }

  assert.match(files.Makefile, /node scripts\/build-crudui-php-extension\.mjs/);
  assert.match(files['tests/containers/native.Containerfile'],
    /node scripts\/build-crudui-php-extension\.mjs/);
  assert.match(files['tests/containers/native.Containerfile'],
    /PHP_EXTENSION_PHP_CONFIG=\/usr\/bin\/php-config8\.4/);
  assert.equal(
    files['tests/containers/native.Containerfile']
      .match(/\/usr\/bin\/php-config8\.4/g)?.length,
    1,
    'The native container must declare php-config once',
  );

  const candidate = normalized(files['examples/form-comparison/Containerfile']);
  assert.match(candidate, /node scripts\/build-crudui-php-extension\.mjs/);
  assert.match(candidate, /node scripts\/build-ordered-json-php-extension\.mjs/);
  assert.match(candidate,
    /--source \/workspace\/source\/\.form-comparison\/sources\/ordered-json\/php-extension\/src/);
  assert.doesNotMatch(candidate, /phpize|autoconf|libtool/i);
  assert.doesNotMatch(candidate, /--cc \/usr\/bin\/gcc-14/);
  assert.doesNotMatch(normalized(files['tests/containers/native.Containerfile']),
    /--cc \/usr\/bin\/gcc-14/);

  for (const removed of [
    'packages/php-ext/config.m4',
    'scripts/build-php-extension.sh',
    'scripts/build-php-extension.mjs',
  ]) {
    assert.equal(requiredSourcePaths.includes(removed), false);
    await assert.rejects(access(new URL(removed, root)));
  }
});

test('container context excludes direct PHP extension build output', () => {
  assert.match(files['.dockerignore'], /^packages\/php-ext\/\.build\/$/m);
  assert.match(files['.dockerignore'], /^packages\/php-ext\/modules\/?$/m);
});

test('PHP extension instructions use the current direct build entry point', () => {
  for (const filename of ['packages/php-ext/README.md', 'packages/php-ext/README.ko.md']) {
    assert.match(files[filename], /node scripts\/build-crudui-php-extension\.mjs/);
    assert.doesNotMatch(files[filename], /sh scripts\/build-php-extension\.sh/);
  }
});

test('CRUDUI PHP extension is an independent C implementation', async () => {
  const entries = await readdir(new URL('packages/php-ext/', root), {
    recursive: true,
    withFileTypes: true,
  });
  const prohibited = entries
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(name => name === 'Cargo.toml' || name === 'Cargo.lock' || name.endsWith('.rs'))
    .sort();
  assert.deepEqual(prohibited, []);
  assert.equal(requiredSourcePaths.includes('packages/php-ext/Cargo.toml'), false);
  assert.equal(requiredSourcePaths.includes('packages/php-ext/Cargo.lock'), false);
  assert.doesNotMatch(
    files['scripts/build-crudui-php-extension.mjs'],
    /\b(?:cargo|rustc|rustdoc|Rust)\b/,
  );
  for (const filename of ['packages/php-ext/README.md', 'packages/php-ext/README.ko.md']) {
    assert.doesNotMatch(files[filename], /\b(?:Cargo|Rust|rustc|rustdoc)\b/);
  }
});
