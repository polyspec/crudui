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
const bindFixtures = fixtures.filter(
  fixture => fixture.expectError?.code !== 'REF_FILE_NOT_FOUND');

function sourceForFixtures() {
  const builder = new CFixtureSource();
  const { lines } = builder;
  bindFixtures.forEach((fixture, index) => {
    const options = fixture.options ?? {};
    const template = JSON.parse(JSON.stringify(
      dispatch({ operation: 'compileForm', spec: fixture.spec, options })));
    let expected;
    let expectedError;
    try {
      expected = JSON.parse(JSON.stringify(dispatch({
        operation: 'bindForm', template, data: fixture.data ?? {}, options,
      })));
    } catch (error) {
      expectedError = errorRecord(error);
    }
    lines.push('  {', `  /* ${fixture.name} */`);
    const templateValue = builder.emit(template);
    const dataValue = builder.emit(fixture.data ?? {});
    const optionsValue = builder.emit(options);
    lines.push(`  ps_value *template_before = ps_value_clone(${templateValue});`);
    lines.push(`  ps_value *data_before = ps_value_clone(${dataValue});`);
    lines.push(`  ps_result actual = ps_bind_form(${templateValue}, ${dataValue}, ${optionsValue});`);
    if (expectedError) {
      lines.push(`  if (actual.value || !actual.error || !ps_is_string(ps_get(actual.error, "code"), ${cString(expectedError.code)}) || !ps_is_string(ps_get(actual.error, "at"), ${cString(expectedError.at)})) { fputs(${cString(`${fixture.name}: error differs\n`)}, stderr); return ${index + 1}; }`);
    } else {
      const expectedValue = builder.emit(expected);
      lines.push(`  if (!actual.value || actual.error || !ps_equal(actual.value, ${expectedValue})) {`);
      lines.push(`    char *actual_json = ps_json_string(actual.value); char *expected_json = ps_json_string(${expectedValue});`);
      lines.push(`    fprintf(stderr, ${cString(`${fixture.name}: fields differ\nactual: %s\nexpected: %s\n`)}, actual_json ? actual_json : "null", expected_json ? expected_json : "null");`);
      lines.push(`    free(actual_json); free(expected_json); return ${index + 1}; }`);
      lines.push(`  ps_value_free(${expectedValue});`);
    }
    lines.push(`  if (!ps_equal(${templateValue}, template_before) || !ps_equal(${dataValue}, data_before)) { fputs(${cString(`${fixture.name}: input changed\n`)}, stderr); return ${index + 1}; }`);
    lines.push(`  ps_value_free(template_before); ps_value_free(data_before); ps_value_free(actual.value); ps_value_free(actual.error); ps_value_free(${templateValue}); ps_value_free(${dataValue}); ps_value_free(${optionsValue});`, '  }');
  });
  return fixtureProgram(lines);
}

test('C extension binds every shared form fixture without changing inputs', async () => {
  assert.equal(fixtures.length, 92,
    'Review C binding coverage when the shared fixture inventory changes');
  assert.equal(bindFixtures.length, 91,
    'Review C binding coverage when compilation error fixtures change');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-bind-'));
  try {
    await compileAndRunCFixture({
      root, directory, source: sourceForFixtures(), name: 'bind-fixtures',
      sources: [
        'value.c', 'value_path.c', 'engine_error.c', 'expression.c',
        'runtime.c', 'design.c', 'widget.c', 'binding.c',
      ],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('C extension binding has no undefined behavior findings', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-bind-sanitize-'));
  try {
    await compileAndRunCFixture({
      root, directory, source: sourceForFixtures(), name: 'bind-fixtures-sanitize',
      sources: [
        'value.c', 'value_path.c', 'engine_error.c', 'expression.c',
        'runtime.c', 'design.c', 'widget.c', 'binding.c',
      ],
      compilerFlags: ['-fsanitize=undefined', '-fno-omit-frame-pointer'],
      runEnvironment: {
        ...process.env,
        UBSAN_OPTIONS: 'halt_on_error=1',
      },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
