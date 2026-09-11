import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Field } from '@crudui/generator-react';

import { CFixtureSource, cString, compileAndRunCFixture, fixtureProgram } from './c-fixture-source.mjs';
import { dispatch } from './javascript.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixtures = JSON.parse(await readFile(
  path.join(root, 'tests/fixtures/form-render/cases.json'), 'utf8'));
const renderFixtures = fixtures.filter(fixture => !fixture.expectError);
const edgeFixtures = [
  {
    name: 'raw-event-attribute-escaping',
    spec: {
      type: 'group',
      properties: {
        value: {
          type: 'text',
          behavior: { onchange: 'if (a > b && c < d) run("x")' },
        },
      },
    },
    data: { value: 'a > b' },
  },
  {
    name: 'style-property-normalization',
    spec: {
      type: 'group',
      properties: {
        value: {
          type: 'text',
          design: {
            style: 'color /* current */: red; backgroundColor: black; msTransform: scale(1); color: blue',
          },
        },
      },
    },
  },
];
const allRenderFixtures = [...renderFixtures, ...edgeFixtures];

function renderFields(fields) {
  return renderToStaticMarkup(createElement(
    'div', { className: 'form-group' },
    fields.map((vm, index) => createElement(Field, { key: index, vm })),
  ));
}

function sourceForFixtures() {
  const builder = new CFixtureSource();
  const { lines } = builder;
  allRenderFixtures.forEach((fixture, index) => {
    const options = fixture.options ?? {};
    const template = JSON.parse(JSON.stringify(
      dispatch({ operation: 'compileForm', spec: fixture.spec, options })));
    const expectedFields = JSON.parse(JSON.stringify(dispatch({
      operation: 'bindForm', template, data: fixture.data ?? {}, options,
    })));
    const expectedHtml = renderFields(expectedFields);
    lines.push('  {', `  /* ${fixture.name} */`);
    const templateValue = builder.emit(template);
    const dataValue = builder.emit(fixture.data ?? {});
    const optionsValue = builder.emit(options);
    lines.push(`  ps_result fields = ps_bind_form(${templateValue}, ${dataValue}, ${optionsValue});`);
    lines.push('  if (!fields.value || fields.error) { fputs("binding failed\\n", stderr); return 1; }');
    lines.push('  ps_value *fields_before = ps_value_clone(fields.value);');
    lines.push('  char *actual = ps_render_fields(fields.value);');
    lines.push(`  if (!actual || strcmp(actual, ${cString(expectedHtml)}) != 0) {`);
    lines.push(`    fprintf(stderr, ${cString(`${fixture.name}: HTML differs\nactual: %s\nexpected: %s\n`)}, actual ? actual : "null", ${cString(expectedHtml)});`);
    lines.push(`    free(actual); return ${index + 1}; }`);
    lines.push(`  if (!fields_before || !ps_equal(fields.value, fields_before)) { fputs(${cString(`${fixture.name}: fields changed\n`)}, stderr); return ${index + 1}; }`);
    lines.push(`  free(actual); ps_value_free(fields_before); ps_value_free(fields.value); ps_value_free(fields.error); ps_value_free(${templateValue}); ps_value_free(${dataValue}); ps_value_free(${optionsValue});`, '  }');
  });
  return fixtureProgram(lines);
}

test('C extension renders successful shared form fixtures and edge cases as exact HTML', async () => {
  assert.equal(fixtures.length, 92,
    'Review C rendering coverage when the shared fixture inventory changes');
  assert.equal(renderFixtures.length, 90,
    'Review C rendering coverage when successful fixtures change');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-render-'));
  try {
    await compileAndRunCFixture({
      root, directory, source: sourceForFixtures(), name: 'render-fixtures',
      sources: [
        'value.c', 'value_path.c', 'engine_error.c', 'expression.c',
        'runtime.c', 'design.c', 'widget.c', 'binding.c', 'render.c',
      ],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('C extension form rendering has no undefined behavior findings', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-render-sanitize-'));
  try {
    await compileAndRunCFixture({
      root, directory, source: sourceForFixtures(), name: 'render-fixtures-sanitize',
      sources: [
        'value.c', 'value_path.c', 'engine_error.c', 'expression.c',
        'runtime.c', 'design.c', 'widget.c', 'binding.c', 'render.c',
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
