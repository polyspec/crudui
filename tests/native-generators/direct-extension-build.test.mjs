import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const makefile = await readFile(new URL('Makefile', root), 'utf8');
const container = await readFile(
  new URL('examples/form-comparison/Containerfile', root), 'utf8',
);

test('PHP extension entry points use the direct build command', async () => {
  const command = 'node scripts/build-php-extension.mjs';
  assert.match(makefile, new RegExp(command.replaceAll('.', '\\.')));
  assert.match(container, new RegExp(command.replaceAll('.', '\\.')));
  await access(new URL('scripts/build-php-extension.mjs', root));
  await assert.rejects(access(new URL('scripts/build-php-extension.sh', root)));
});

test('PHP extension build does not use generated link-based build tools', async () => {
  const source = await readFile(new URL('scripts/build-php-extension.mjs', root), 'utf8');
  assert.doesNotMatch(source, /phpize|autoconf|libtool/);
  assert.match(source, /COMPILE_DL_CRUDUI/);
  assert.match(source, /isSymbolicLink/);
});
