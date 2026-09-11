import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { CFixtureSource, cString, compileAndRunCFixture, fixtureProgram } from './c-fixture-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixtures = JSON.parse(await readFile(
  path.join(root, 'tests/fixtures/expr/cases.json'), 'utf8'));

function sourceForFixtures() {
  const builder = new CFixtureSource();
  const { lines } = builder;
  let caseIndex = 0;
  for (const fixture of fixtures) {
    for (const example of fixture.cases) {
      caseIndex += 1;
      lines.push('  {', `  /* ${fixture.name} */`);
      const data = builder.emit(example.data);
      const expected = builder.emit(example.value);
      const pathItems = example.currentPath ?? [];
      const currentPath = `path${caseIndex}`;
      if (pathItems.length) {
        lines.push(`  const char *${currentPath}[] = {${pathItems.map(cString).join(', ')}};`);
      } else {
        lines.push(`  const char **${currentPath} = NULL;`);
      }
      lines.push('  bool parsed_value = false;');
      lines.push(`  ps_value *actual = ps_expression_value(${cString(fixture.expr)}, ${data}, ${currentPath}, ${pathItems.length}, &parsed_value);`);
      lines.push('  bool parsed_truth = false;');
      lines.push(`  bool truth = ps_expression_truth(${cString(fixture.expr)}, ${data}, ${currentPath}, ${pathItems.length}, &parsed_truth);`);
      lines.push(`  if (!parsed_value || !parsed_truth || !actual || !ps_equal(actual, ${expected}) || truth != ${example.truthy}) {`);
      lines.push(`    fputs(${cString(`${fixture.name} case ${caseIndex}: expression result differs\n`)}, stderr); return ${caseIndex};`);
      lines.push('  }');
      lines.push(`  ps_value_free(actual); ps_value_free(${expected}); ps_value_free(${data});`);
      lines.push('  }');
    }
  }
  return fixtureProgram(lines);
}

test('C extension evaluates every shared expression fixture', async () => {
  assert.equal(fixtures.length, 38,
    'Review C expression coverage when the shared fixture inventory changes');
  assert.equal(fixtures.reduce((total, fixture) => total + fixture.cases.length, 0), 77,
    'Review C expression coverage when the shared fixture cases change');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-expression-'));
  try {
    await compileAndRunCFixture({
      root, directory, source: sourceForFixtures(), name: 'expression-fixtures',
      sources: ['value.c', 'value_path.c', 'expression.c'],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
