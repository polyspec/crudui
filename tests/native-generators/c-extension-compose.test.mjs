import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { CFixtureSource, cString, compileAndRunCFixture, fixtureProgram } from './c-fixture-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cases = JSON.parse(await readFile(
  path.join(root, 'tests/fixtures/compose/cases.json'), 'utf8'));

function sourceForCases() {
  const builder = new CFixtureSource();
  const { lines } = builder;

  cases.forEach((fixture, index) => {
    lines.push('  {');
    lines.push(`  /* ${fixture.name} */`);
    const entry = builder.emit(fixture.input.entry);
    const files = builder.emit(fixture.input.files ?? {});
    lines.push('  ps_value *error = NULL;');
    const operation = fixture.input.kind === 'spec' ? 'ps_compose_spec' : 'ps_compose_properties';
    lines.push(`  ps_value *actual = ${operation}(${entry}, ${files}, ${cString(fixture.input.basepath ?? '')}, &error);`);
    if (fixture.expected) {
      const expected = builder.emit(fixture.expected);
      lines.push(`  if (!actual || error || !ps_equal(actual, ${expected})) { fprintf(stderr, ${cString(`${fixture.name}: composed result differs\n`)}); return ${index + 1}; }`);
      lines.push(`  ps_value_free(${expected});`);
    } else {
      lines.push(`  if (actual || !error || !ps_is_string(ps_get(error, "code"), ${cString(fixture.expectError.code)})) { fprintf(stderr, ${cString(`${fixture.name}: error differs\n`)}); return ${index + 1}; }`);
    }
    lines.push(`  ps_value_free(actual); ps_value_free(error); ps_value_free(${entry}); ps_value_free(${files});`);
    lines.push('  }');
  });
  return fixtureProgram(lines);
}

test('C extension satisfies all composition fixtures', async () => {
  assert.equal(cases.length, 20,
    'Review C composition coverage when the shared fixture inventory changes');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-compose-'));
  try {
    await compileAndRunCFixture({
      root, directory, source: sourceForCases(), name: 'compose-fixtures',
      sources: ['value.c', 'engine_error.c', 'compose.c'],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
