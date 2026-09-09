import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const checker = fileURLToPath(new URL('./php-doc-coverage.php', import.meta.url));
const literal = value => "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
function check(source, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'crudui-php-doc-'));
  try {
    mkdirSync(join(root, 'src')); mkdirSync(join(root, 'vendor'));
    writeFileSync(join(root, 'src/Example.php'), source);
    if (options.autoload !== false) writeFileSync(join(root, 'vendor/autoload.php'), options.autoload ?? "<?php require __DIR__ . '/../src/Example.php';");
    if (options.other) writeFileSync(join(root, 'Other.php'), options.other);
    const command = `require ${literal(checker)}; echo json_encode(crudui_php_doc_gaps(${literal(join(root, 'src'))}));`;
    return spawnSync(process.env.PHP ?? 'php', ['-r', command], { encoding: 'utf8' });
  } finally { rmSync(root, { recursive: true }); }
}
test('PHP checker rejects missing Composer autoload', () => {
  const result = check('<?php class Example {}', { autoload: false });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Composer autoload is required/);
});
test('PHP checker reports an unresolved own class', () => {
  const result = check('<?php namespace Coverage; /** Example. */ class Example {}', { autoload: '<?php' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['Coverage\\Example (source declaration cannot be loaded)']);
});
test('PHP checker rejects a class loaded from another source file', () => {
  const result = check('<?php namespace Coverage; /** Example. */ class Example {}', { autoload: "<?php require __DIR__ . '/../Other.php';", other: '<?php namespace Coverage; /** Other. */ class Example {}' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['Coverage\\Example (loaded class does not match its source file)']);
});
test('PHP checker reports missing class and public method documentation', () => {
  const result = check('<?php namespace Coverage; class Example { public function run(): void {} private function helper(): void {} }');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['Coverage\\Example', 'Coverage\\Example::run()']);
});
test('PHP tokenizer handles readonly classes and excludes anonymous classes and class constants', () => {
  const result = check(`<?php namespace Coverage; /** Example. */ readonly class Example { /** Execute. */ public function run(): string { $object = new class {}; return self::class; } }`);
  assert.equal(result.status, 0, result.stderr); assert.deepEqual(JSON.parse(result.stdout), []);
});
test('PHP enums require source docs without requiring docs on runtime-generated methods', () => {
  const result = check('<?php namespace Coverage; /** Choice. */ enum Choice: string { case One = "one"; }');
  assert.equal(result.status, 0, result.stderr); assert.deepEqual(JSON.parse(result.stdout), []);
});
test('PHP checker rejects a source tree without declarations', () => {
  const result = check('<?php');
  assert.equal(result.status, 0, result.stderr); assert.match(JSON.parse(result.stdout)[0], /no class declarations found/);
});
