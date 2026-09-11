import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { CFixtureSource, cString, compileAndRunCFixture, fixtureProgram } from './c-fixture-source.mjs';
import { dispatch, errorRecord } from './javascript.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixtures = JSON.parse(await readFile(
  path.join(root, 'tests/fixtures/form-render/cases.json'), 'utf8'));

function sourceForFixtures() {
  const builder = new CFixtureSource();
  const { lines } = builder;
  fixtures.forEach((fixture, index) => {
    const request = { operation: 'compileForm', spec: fixture.spec, options: fixture.options ?? {} };
    let expected;
    let expectedError;
    try { expected = JSON.parse(JSON.stringify(dispatch(request))); }
    catch (error) { expectedError = errorRecord(error); }
    lines.push('  {', `  /* ${fixture.name} */`);
    const spec = builder.emit(request.spec);
    const options = builder.emit(request.options);
    lines.push(`  ps_result actual = ps_compile_form(${spec}, ${options});`);
    if (expectedError) {
      lines.push(`  if (actual.value || !actual.error || !ps_is_string(ps_get(actual.error, "code"), ${cString(expectedError.code)})) { fputs(${cString(`${fixture.name}: error differs\n`)}, stderr); return ${index + 1}; }`);
    } else {
      const value = builder.emit(expected);
      lines.push(`  if (!actual.value || actual.error || !ps_equal(actual.value, ${value})) { fputs(${cString(`${fixture.name}: template differs\n`)}, stderr); return ${index + 1}; }`);
      lines.push(`  ps_value_free(${value});`);
    }
    lines.push(`  ps_value_free(actual.value); ps_value_free(actual.error); ps_value_free(${spec}); ps_value_free(${options});`, '  }');
  });
  return fixtureProgram(lines);
}

test('C extension compiles every shared form fixture', async () => {
  assert.equal(fixtures.length, 92,
    'Review C template coverage when the shared fixture inventory changes');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-compile-'));
  try {
    await compileAndRunCFixture({
      root, directory, source: sourceForFixtures(), name: 'compile-fixtures',
      sources: ['value.c', 'engine_error.c', 'compose.c', 'template.c'],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
