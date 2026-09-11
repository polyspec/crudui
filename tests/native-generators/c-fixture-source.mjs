import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

export function cString(value) {
  const bytes = Buffer.from(value, 'utf8');
  return `"${[...bytes].map(byte => `\\${byte.toString(8).padStart(3, '0')}`).join('')}"`;
}

export class CFixtureSource {
  #next = 0;
  lines = [];

  emit(value) {
    const name = `v${this.#next++}`;
    if (value === null) this.lines.push(`  ps_value *${name} = ps_null_value();`);
    else if (typeof value === 'boolean')
      this.lines.push(`  ps_value *${name} = ps_bool_value(${value});`);
    else if (typeof value === 'number' && Number.isSafeInteger(value))
      this.lines.push(`  ps_value *${name} = ps_int_value(INT64_C(${value}));`);
    else if (typeof value === 'number')
      this.lines.push(`  ps_value *${name} = ps_float_value(${value});`);
    else if (typeof value === 'string')
      this.lines.push(`  ps_value *${name} = ps_string_value(${cString(value)});`);
    else if (Array.isArray(value)) {
      this.lines.push(`  ps_value *${name} = ps_array_value();`);
      for (const item of value) this.lines.push(`  push(${name}, ${this.emit(item)});`);
    } else {
      this.lines.push(`  ps_value *${name} = ps_object_value();`);
      for (const [key, item] of Object.entries(value))
        this.lines.push(`  put(${name}, ${cString(key)}, ${this.emit(item)});`);
    }
    return name;
  }
}

export function fixtureProgram(body) {
  return [
    '#include "engine_internal.h"',
    '#include <stdio.h>',
    '#include <stdlib.h>',
    '#include <string.h>',
    '',
    'static void put(ps_value *object, const char *key, ps_value *value)',
    '{ if (!value || !ps_set(object, key, value)) { fputs("fixture allocation failed\\n", stderr); abort(); } }',
    'static void push(ps_value *array, ps_value *value)',
    '{ if (!value || !ps_append(array, value)) { fputs("fixture allocation failed\\n", stderr); abort(); } }',
    '',
    'int main(void)',
    '{',
    ...body,
    '  return 0;',
    '}',
    '',
  ].join('\n');
}

export function compileAndRunCFixture({ root, directory, source, sources, name }) {
  const fixtureSource = path.join(directory, `${name}.c`);
  const executable = path.join(directory, name);
  return import('node:fs').then(({ writeFileSync }) => {
    writeFileSync(fixtureSource, source);
    const native = file => path.join(root, 'packages/php-ext/native', file);
    const compile = spawnSync(process.env.CC ?? 'cc', [
      '-std=c11', '-Wall', '-Wextra', '-Werror', '-pedantic',
      '-I', path.join(root, 'packages/php-ext/native'),
      ...sources.map(native), fixtureSource, '-o', executable,
    ], { encoding: 'utf8' });
    assert.equal(compile.error, undefined);
    assert.equal(compile.signal, null);
    assert.equal(compile.status, 0, compile.stderr || compile.stdout);
    const run = spawnSync(executable, [], { encoding: 'utf8' });
    assert.equal(run.error, undefined);
    assert.equal(run.signal, null);
    assert.equal(run.status, 0, run.stderr || run.stdout);
  });
}
