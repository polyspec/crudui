import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { access, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Node } from '@crudui/generator-react';
import { buildDetail } from '@crudui/generator-core';

import { buildTargets } from '../../../examples/form-comparison/src/build-targets.mjs';
import { dateCases, dateListSpec, imageCase, numberCases, urlCase } from '../../../tests/native-generators/cases.mjs';
import { dispatch, errorRecord } from '../../../tests/native-generators/javascript.mjs';
import { recordConformance } from '../../../tests/conformance/evidence.mjs';

/* A C string literal of the UTF-8 bytes of a value; a NUL character is a zero byte in it. */
export function cString(value) {
  const bytes = Buffer.from(value, 'utf8');
  return `"${[...bytes].map(byte => `\\${byte.toString(8).padStart(3, '0')}`).join('')}"`;
}

/* The same bytes as engine text with their explicit length. */
export function cText(value) {
  return `((ps_text){${cString(value)}, ${Buffer.byteLength(value, 'utf8')}})`;
}

export class EngineFixtureSource {
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
      // A C double literal: an integral JavaScript number prints without a decimal point,
      // which C would read as an integer literal and convert.
      this.lines.push(`  ps_value *${name} = ps_float_value(${/[.eE]|Infinity|NaN/.test(String(value)) ? value : `${value}.0`});`);
    else if (typeof value === 'string')
      this.lines.push(`  ps_value *${name} = ps_text_value_checked(${cText(value)});`);
    else if (Array.isArray(value)) {
      this.lines.push(`  ps_value *${name} = ps_array_value();`);
      for (const item of value) this.lines.push(`  push(${name}, ${this.emit(item)});`);
    } else {
      this.lines.push(`  ps_value *${name} = ps_object_value();`);
      for (const [key, item] of Object.entries(value))
        this.lines.push(`  put(${name}, ${cText(key)}, ${this.emit(item)});`);
    }
    return name;
  }
}

/* Shared C value builders; a program includes only the helpers it calls. */
const fixtureHelpers = [
  ['put', [
      'static void put(ps_value *object, ps_text key, ps_value *value)',
      '{ if (!value || !ps_set_text(object, key, value)) { fputs("fixture allocation failed\\n", stderr); abort(); } }',,
  ]],
  ['push', [
      'static void push(ps_value *array, ps_value *value)',
      '{ if (!value || !ps_append(array, value)) { fputs("fixture allocation failed\\n", stderr); abort(); } }',,
  ]],
  ['ps_text_value_checked', [
      'static ps_value *ps_text_value_checked(ps_text text)',
      '{ ps_value *value = ps_text_value(text); if (!value) { fputs("fixture string allocation failed\\n", stderr); abort(); } return value; }',,
  ]],
  ['text_is', [
      '/* A string value with exactly these bytes. */',
      'static bool text_is(const ps_value *value, ps_text text)',
      '{ return value && value->kind == PS_STRING && ps_text_equal(ps_string(value), text); }',,
  ]],
  ['print_text', [
      '/* Write text with every byte, including NUL characters, to standard error. */',
      'static void print_text(const char *label, ps_text text)',
      '{ fputs(label, stderr); fwrite(text.bytes, 1, text.length, stderr); fputc(\'\\n\', stderr); }',,
  ]],
  ['print_json', [
      'static void print_json(const char *label, const ps_value *value)',
      '{ ps_chars json = ps_json_string(value); print_text(label, json.bytes ? ps_view(json) : PS_TEXT("null")); free(json.bytes); }',,
  ]],
];

/*
 * Per-case results of a fixture program. A program that reports cases declares
 * `int failed = 0;` first (caseProgramStart), runs each case in its own block that sets
 * `ok = 0` on a mismatch instead of returning, prints `crudui-case <id> pass|fail` with
 * caseReport and ends with caseProgramEnd, which exits with the first failing case id.
 */
const caseProgramStart = ['  int failed = 0;'];
const caseProgramEnd = ['  return failed;'];
function caseReport(id) {
  return [
    `  printf("crudui-case ${id} %s\\n", ok ? "pass" : "fail"); fflush(stdout);`,
    `  if (!ok && !failed) failed = ${id};`,
  ];
}

/**
 * Case results printed by a fixture program: id to passed. A case reported more than once
 * passes only when every report passed.
 */
export function caseResults(stdout) {
  const results = new Map();
  for (const [, id, state] of stdout.matchAll(/^crudui-case (\d+) (pass|fail)$/gm)) {
    results.set(Number(id), (results.get(Number(id)) ?? true) && state === 'pass');
  }
  return results;
}

/**
 * Record php-native conformance evidence for the cases of a fixture program. A case the
 * program did not report, because compilation failed or the program stopped, did not pass.
 */
function recordCases(cases, stdout) {
  const results = caseResults(stdout);
  cases.forEach(({ features, fixture, name }, index) => {
    const passed = results.get(index + 1) === true;
    for (const feature of features) {
      recordConformance({ feature, fixture, runtime: 'php-native', case: name, passed });
    }
  });
}

export function fixtureProgram(body, declarations = []) {
  // A helper is included when the program or an included helper calls it.
  let used = [...declarations, ...body].join('\n');
  const included = new Set();
  for (let changed = true; changed;) {
    changed = false;
    for (const [name, lines] of fixtureHelpers) {
      if (included.has(name) || !new RegExp(`\\b${name}\\(`).test(used)) continue;
      included.add(name);
      used += `\n${lines.join('\n')}`;
      changed = true;
    }
  }
  const helpers = fixtureHelpers
    .filter(([name]) => included.has(name))
    .flatMap(([, lines]) => lines);
  return [
    '#include "engine_internal.h"',
    '#include <stdio.h>',
    '#include <stdlib.h>',
    '#include <string.h>',
    '',
    ...helpers,
    '',
    ...declarations,
    'int main(void)',
    '{',
    ...body,
    '  return 0;',
    '}',
    '',
  ].join('\n');
}

/*
 * Every test compiles and runs a C program, so each step reports its start, its
 * elapsed time and its result while it runs, and the test's own timeout aborts the
 * step it is in. Measured on macOS (Apple silicon, warm caches): a plain
 * compile-and-run takes 0.5–1.1 s and a sanitized one up to 1.2 s. The budgets below
 * leave room for slower and loaded machines, including the CI runners.
 */
export const ENGINE_TEST_BUDGET = 30000;
export const ENGINE_SANITIZER_BUDGET = 60000;
// Tests that only read repository files; measured at 20–70 ms together.
export const ENGINE_INSPECTION_BUDGET = 10000;
const PROGRESS_INTERVAL = 5000;

/** Run one step of a fixture program, reporting progress until it finishes. */
function runStep(label, command, args, { signal, env } = {}) {
  const started = Date.now();
  const elapsed = () => `${((Date.now() - started) / 1000).toFixed(1)}s`;
  process.stderr.write(`    ${label}: started\n`);
  const running = setInterval(
    () => process.stderr.write(`    ${label}: still running (${elapsed()})\n`), PROGRESS_INTERVAL);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: env ?? process.env, signal, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', error => { clearInterval(running); reject(error); });
    child.once('close', (status, closeSignal) => {
      clearInterval(running);
      process.stderr.write(`    ${label}: ${status === 0 ? 'passed' : `failed (${closeSignal ?? status})`} in ${elapsed()}\n`);
      resolve({ status, signal: closeSignal, stdout, stderr });
    });
  });
}

export async function compileAndRunEngineFixture({ root, directory, source, sources, name,
  compilerFlags = [], runEnvironment, signal, onOutput }) {
  const fixtureSource = path.join(directory, `${name}.c`);
  const executable = path.join(directory, name);
  await writeFile(fixtureSource, source);
  const extensionSource = file => path.join(root, 'packages/php-ext/src', file);
  const compile = await runStep(`${name}: compiling ${sources.length} sources`,
    process.env.CC ?? 'cc', [
      '-std=c11', '-Wall', '-Wextra', '-Werror', '-pedantic',
      ...compilerFlags,
      '-I', path.join(root, 'packages/php-ext/src'),
      ...sources.map(extensionSource), fixtureSource, '-o', executable, '-lm',
    ], { signal });
  assert.equal(compile.signal, null);
  assert.equal(compile.status, 0, compile.stderr || compile.stdout);
  const run = await runStep(`${name}: running`, executable, [],
    { signal, env: runEnvironment ?? process.env });
  onOutput?.(run.stdout);
  assert.equal(run.signal, null, run.stderr || run.stdout);
  assert.equal(run.status, 0, run.stderr || run.stdout);
}

{
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtures = JSON.parse(await readFile(
  path.join(root, 'tests/fixtures/form-render/cases.json'), 'utf8'));

function sourceForFixtures() {
  const builder = new EngineFixtureSource();
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
      lines.push(`  if (actual.value || !actual.error || !text_is(ps_get(actual.error, "code"), ${cText(expectedError.code)})) { print_text("error differs: ", ${cText(fixture.name)}); return ${index + 1}; }`);
    } else {
      const value = builder.emit(expected);
      lines.push(`  if (!actual.value || actual.error || !ps_equal(actual.value, ${value})) { print_text("template differs: ", ${cText(fixture.name)}); return ${index + 1}; }`);
      lines.push(`  ps_value_free(${value});`);
    }
    lines.push(`  ps_value_free(actual.value); ps_value_free(actual.error); ps_value_free(${spec}); ps_value_free(${options});`, '  }');
  });
  return fixtureProgram(lines);
}

test('PHP extension engine compiles every shared form fixture', { timeout: ENGINE_TEST_BUDGET }, async t => {
  assert.equal(fixtures.length, 93,
    'Review C template coverage when the shared fixture inventory changes');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-compile-'));
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForFixtures(), name: 'compile-fixtures',
      sources: ['value.c', 'engine_error.c', 'compose.c', 'declaration.c', 'template.c'],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
}

{
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const cases = JSON.parse(await readFile(
  path.join(root, 'tests/fixtures/compose/cases.json'), 'utf8'));

function sourceForCases() {
  const builder = new EngineFixtureSource();
  const { lines } = builder;

  lines.push(...caseProgramStart);
  cases.forEach((fixture, index) => {
    lines.push('  {');
    lines.push(`  /* ${fixture.name} */`);
    lines.push('  int ok = 1;');
    const entry = builder.emit(fixture.input.entry);
    const files = builder.emit(fixture.input.files ?? {});
    lines.push('  ps_value *error = NULL;');
    const operation = fixture.input.kind === 'spec' ? 'ps_compose_spec' : 'ps_compose_properties';
    lines.push(`  ps_value *actual = ${operation}(${entry}, ${files}, ${cText(fixture.input.basepath ?? '')}, &error);`);
    if (fixture.expected) {
      const expected = builder.emit(fixture.expected);
      lines.push(`  if (!actual || error || !ps_equal(actual, ${expected})) { ok = 0; print_text("composed result differs: ", ${cText(fixture.name)}); }`);
      lines.push(`  ps_value_free(${expected});`);
    } else {
      lines.push(`  if (actual || !error || !text_is(ps_get(error, "code"), ${cText(fixture.expectError.code)})) { ok = 0; print_text("error differs: ", ${cText(fixture.name)}); }`);
    }
    lines.push(`  ps_value_free(actual); ps_value_free(error); ps_value_free(${entry}); ps_value_free(${files});`);
    lines.push(...caseReport(index + 1));
    lines.push('  }');
  });
  lines.push(...caseProgramEnd);
  return fixtureProgram(lines);
}

function sourceForInvalidReference() {
  const builder = new EngineFixtureSource();
  const entry = builder.emit({ field: { $ref: null }, fixture: { values: ['used'] } });
  const files = builder.emit({});
  builder.lines.push(
    '  ps_value *error = NULL;',
    `  ps_value *actual = ps_compose_properties(${entry}, ${files}, PS_TEXT(""), &error);`,
    '  if (actual || !error ||',
    '      !ps_is_string(ps_get(error, "code"), "REF_VALUE_TYPE")) return 1;',
    '  ps_value_free(error);',
    `  ps_value_free(${entry}); ps_value_free(${files});`,
  );
  return fixtureProgram(builder.lines);
}

test('PHP extension engine satisfies all composition fixtures', { timeout: ENGINE_TEST_BUDGET }, async t => {
  assert.equal(cases.length, 20,
    'Review C composition coverage when the shared fixture inventory changes');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-compose-'));
  let output = '';
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForCases(), name: 'compose-fixtures',
      sources: ['value.c', 'engine_error.c', 'compose.c'],
      onOutput: stdout => { output = stdout; },
    });
  } finally {
    recordCases(cases.map(fixture => ({
      features: ['compileForm'], fixture: 'tests/fixtures/compose/cases.json', name: fixture.name,
    })), output);
    await rm(directory, { recursive: true, force: true });
  }
});

test('PHP extension engine rejects a null reference value', { timeout: ENGINE_TEST_BUDGET }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-compose-invalid-'));
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForInvalidReference(), name: 'compose-invalid',
      sources: ['value.c', 'engine_error.c', 'compose.c'],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
}

{
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtures = JSON.parse(await readFile(
  path.join(root, 'tests/fixtures/expr/cases.json'), 'utf8'));

function sourceForFixtures() {
  const builder = new EngineFixtureSource();
  const { lines } = builder;
  let caseIndex = 0;
  lines.push(...caseProgramStart);
  for (const [fixtureIndex, fixture] of fixtures.entries()) {
    for (const example of fixture.cases) {
      caseIndex += 1;
      lines.push('  {', `  /* ${fixture.name} */`, '  int ok = 1;');
      const data = builder.emit(example.data);
      const expected = builder.emit(example.value);
      const pathItems = example.currentPath ?? [];
      const currentPath = `path${caseIndex}`;
      if (pathItems.length) {
        lines.push(`  const ps_text ${currentPath}[] = {${pathItems.map(cText).join(', ')}};`);
      } else {
        lines.push(`  const ps_text *${currentPath} = NULL;`);
      }
      lines.push('  bool parsed_value = false;');
      lines.push(`  ps_value *actual = ps_expression_value(${cText(fixture.expr)}, ${data}, ${currentPath}, ${pathItems.length}, &parsed_value);`);
      lines.push('  bool parsed_truth = false;');
      lines.push(`  bool truth = ps_expression_truth(${cText(fixture.expr)}, ${data}, ${currentPath}, ${pathItems.length}, &parsed_truth);`);
      lines.push(`  if (!parsed_value || !parsed_truth || !actual || !ps_equal(actual, ${expected}) || truth != ${example.truthy}) {`);
      lines.push(`    ok = 0; print_text("expression result differs: ", ${cText(`${fixture.name} case ${caseIndex}`)});`);
      lines.push('  }');
      lines.push(`  ps_value_free(actual); ps_value_free(${expected}); ps_value_free(${data});`);
      // Every example of an entry reports under the entry, which passes only when all do.
      lines.push(...caseReport(fixtureIndex + 1));
      lines.push('  }');
    }
  }
  lines.push(...caseProgramEnd);
  return fixtureProgram(lines);
}

test('PHP extension engine evaluates every shared expression fixture', { timeout: ENGINE_TEST_BUDGET }, async t => {
  assert.equal(fixtures.length, 38,
    'Review C expression coverage when the shared fixture inventory changes');
  assert.equal(fixtures.reduce((total, fixture) => total + fixture.cases.length, 0), 77,
    'Review C expression coverage when the shared fixture cases change');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-expression-'));
  let output = '';
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForFixtures(), name: 'expression-fixtures',
      sources: ['value.c', 'value_path.c', 'expression.c'],
      onOutput: stdout => { output = stdout; },
    });
  } finally {
    recordCases(fixtures.map(fixture => ({
      features: ['validate'], fixture: 'tests/fixtures/expr/cases.json', name: fixture.name,
    })), output);
    await rm(directory, { recursive: true, force: true });
  }
});
}

{
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const validationCases = JSON.parse(await readFile(
  path.join(root, 'tests/fixtures/validate/cases.json'), 'utf8'));
const specCases = JSON.parse(await readFile(
  path.join(root, 'tests/fixtures/spec-validity/cases.json'), 'utf8'));
const listCases = JSON.parse(await readFile(
  path.join(root, 'tests/fixtures/list-validity/cases.json'), 'utf8'));
const detailCases = JSON.parse(await readFile(
  path.join(root, 'tests/fixtures/detail-validity/cases.json'), 'utf8'));

/* Every pattern or match rule value declared in a specification tree. */
function patternParameters(value, found = []) {
  if (!value || typeof value !== 'object') return found;
  for (const [key, item] of Object.entries(value)) {
    if (key === 'validate' && item && typeof item === 'object' && !Array.isArray(item)) {
      for (const rule of ['match', 'pattern']) if (Object.hasOwn(item, rule)) found.push(item[rule]);
    }
    patternParameters(item, found);
  }
  return found;
}

/* Every scalar in a data tree: the values a pattern rule can receive. */
function scalarValues(value, found = []) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') found.push(value);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) scalarValues(item, found);
  return found;
}

/*
 * The pattern rule results of the pure PHP library (CRUDUI\Validator\Rules\Pattern) for every
 * parameter and value pair. The engine delegates the rule to its host; the fixture programs
 * answer it from this table and fail on any input the table does not hold.
 */
function libraryPatternResults(pairs) {
  if (!pairs.length) return [];
  const autoload = path.join(root, 'packages/validator-php/vendor/autoload.php');
  const script = [
    'require $argv[1];',
    '$rule = new CRUDUI\\Validator\\Rules\\Pattern();',
    '$pairs = json_decode(stream_get_contents(STDIN), false, 512, JSON_THROW_ON_ERROR);',
    'echo json_encode(array_map(fn($pair) => $rule->validate($pair[1], $pair[0], [], ""), $pairs), JSON_THROW_ON_ERROR);',
  ].join(' ');
  const result = spawnSync(process.env.PHP ?? 'php',
    ['-n', '-d', 'display_errors=stderr', '-r', script, autoload],
    { input: JSON.stringify(pairs), encoding: 'utf8' });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const results = JSON.parse(result.stdout);
  assert.equal(results.length, pairs.length);
  return results;
}

function patternRuleDeclarations(count) {
  return [
    'typedef struct { ps_value *parameter; ps_value *value; int result; } pattern_case;',
    `static pattern_case pattern_cases[${count + 1}];`,
    'static size_t pattern_case_count;',
    '',
    'int ps_pattern_rule(const ps_value *value, const ps_value *parameter)',
    '{',
    '  for (size_t i = 0; i < pattern_case_count; ++i)',
    '    if (ps_equal(pattern_cases[i].parameter, parameter) && ps_equal(pattern_cases[i].value, value))',
    '      return pattern_cases[i].result;',
    '  fputs("unexpected pattern rule input\\n", stderr);',
    '  return -1;',
    '}',
    '',
  ];
}

/** The evidence each validation program case proves, in program order. */
const validationEvidence = [
  ...validationCases.map(fixture => ({ features: ['validate'], fixture: 'tests/fixtures/validate/cases.json', name: fixture.name })),
  ...specCases.map(fixture => ({ features: ['validate'], fixture: 'tests/fixtures/spec-validity/cases.json', name: fixture.name })),
  ...listCases.map(fixture => ({ features: ['validateList'], fixture: 'tests/fixtures/list-validity/cases.json', name: fixture.name })),
  ...detailCases.map(fixture => ({ features: ['validateDetail'], fixture: 'tests/fixtures/detail-validity/cases.json', name: fixture.name })),
];

function sourceForValidation() {
  const builder = new EngineFixtureSource();
  const { lines } = builder;
  let status = 1;
  lines.push(...caseProgramStart);
  const pairs = new Map();
  for (const fixture of validationCases) {
    const parameters = patternParameters([fixture.spec, fixture.files ?? {}]);
    for (const parameter of parameters)
      for (const value of scalarValues(fixture.data))
        pairs.set(JSON.stringify([parameter, value]), [parameter, value]);
  }
  const patternPairs = [...pairs.values()];
  libraryPatternResults(patternPairs).forEach((passed, index) => {
    const [parameter, value] = patternPairs[index];
    const parameterValue = builder.emit(parameter);
    const valueValue = builder.emit(value);
    lines.push(`  pattern_cases[pattern_case_count++] = (pattern_case){${parameterValue}, ${valueValue}, ${passed ? 1 : 0}};`);
  });

  const check = ({ name, operation, inputs, expected, error }) => {
    lines.push('  {', `  /* ${name} */`, '  int ok = 1;');
    const arguments_ = inputs.map(value => builder.emit(value));
    lines.push(`  ps_result actual = ${operation}(${arguments_.join(', ')});`);
    if (error) {
      const conditions = [`!text_is(ps_get(actual.error, "code"), ${cText(error.code)})`];
      if (error.message !== undefined)
        conditions.push(`!text_is(ps_get(actual.error, "message"), ${cText(error.message)})`);
      if (error.at !== undefined)
        conditions.push(`!text_is(ps_get(actual.error, "at"), ${cText(error.at)})`);
      lines.push(`  if (actual.value || !actual.error || ${conditions.join(' || ')})`);
      lines.push('  {');
      lines.push(`    ok = 0; print_text("error differs: ", ${cText(name)});`);
      lines.push('  }');
    } else if (expected !== undefined) {
      const expectedValue = builder.emit(expected);
      lines.push(`  if (!actual.value || actual.error || !ps_equal(actual.value, ${expectedValue})) {`);
      lines.push(`    print_text("result differs: ", ${cText(name)});`);
      lines.push('    print_json("actual: ", actual.value);');
      lines.push(`    print_json("expected: ", ${expectedValue});`);
      lines.push('    ok = 0;');
      lines.push('  }');
      lines.push(`  ps_value_free(${expectedValue});`);
    } else {
      lines.push('  if (!actual.value || actual.error) {');
      lines.push(`    ok = 0; print_text("operation failed: ", ${cText(name)});`);
      lines.push('  }');
    }
    lines.push('  ps_value_free(actual.value); ps_value_free(actual.error);');
    lines.push(...arguments_.map(value => `  ps_value_free(${value});`));
    lines.push(...caseReport(status), '  }');
    status += 1;
  };

  for (const fixture of validationCases) {
    check({
      name: `validate:${fixture.name}`,
      operation: 'ps_validate',
      inputs: [fixture.spec, fixture.data, {
        ...(fixture.files === undefined ? {} : { files: fixture.files }),
        ...(fixture.basepath === undefined ? {} : { basepath: fixture.basepath }),
      }],
      expected: fixture.expected,
      error: fixture.expectFailure,
    });
  }
  for (const fixture of specCases) {
    const error = typeof fixture.engine === 'object'
      ? { code: fixture.engine.code, at: fixture.engine.at } : undefined;
    check({
      name: `spec:${fixture.name}`,
      operation: 'ps_validate',
      inputs: [fixture.spec, {}, fixture.files === undefined ? {} : { files: fixture.files }],
      expected: { valid: true, errors: [] },
      error,
    });
  }
  for (const [family, operation, cases] of [
    ['list', 'ps_validate_list', listCases],
    ['detail', 'ps_validate_detail', detailCases],
  ]) {
    for (const fixture of cases) {
      const error = typeof fixture.engine === 'object'
        ? { code: fixture.engine.code, at: fixture.engine.at } : undefined;
      check({
        name: `${family}:${fixture.name}`,
        operation,
        inputs: [fixture.spec, fixture.files === undefined ? {} : { files: fixture.files }],
        expected: { valid: true, errors: [] },
        error,
      });
    }
  }
  lines.push('  for (size_t i = 0; i < pattern_case_count; ++i) { ps_value_free(pattern_cases[i].parameter); ps_value_free(pattern_cases[i].value); }');
  lines.push(...caseProgramEnd);
  return fixtureProgram(lines, patternRuleDeclarations(patternPairs.length));
}

test('PHP extension engine validates all shared form, list and detail cases', { timeout: ENGINE_TEST_BUDGET }, async t => {
  assert.equal(validationCases.length + specCases.length + listCases.length + detailCases.length, 115,
    'Review extension validation coverage when the shared fixture inventory changes');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-extension-validation-'));
  let output = '';
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForValidation(), name: 'validation',
      sources: [
        'value.c', 'value_path.c', 'engine_error.c', 'compose.c', 'expression.c',
        'runtime.c', 'validation.c',
      ],
      onOutput: stdout => { output = stdout; },
    });
  } finally {
    recordCases(validationEvidence, output);
    await rm(directory, { recursive: true, force: true });
  }
});

test('PHP extension engine validation has no undefined behavior findings', { timeout: ENGINE_SANITIZER_BUDGET }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-extension-validation-sanitize-'));
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForValidation(), name: 'validation-sanitize',
      sources: [
        'value.c', 'value_path.c', 'engine_error.c', 'compose.c', 'expression.c',
        'runtime.c', 'validation.c',
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

test('PHP extension engine validation has no address sanitizer findings', {
  skip: process.platform !== 'linux',
  timeout: ENGINE_SANITIZER_BUDGET,
}, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-extension-validation-address-'));
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForValidation(), name: 'validation-address',
      sources: [
        'value.c', 'value_path.c', 'engine_error.c', 'compose.c', 'expression.c',
        'runtime.c', 'validation.c',
      ],
      compilerFlags: ['-fsanitize=address', '-fno-omit-frame-pointer'],
      runEnvironment: {
        ...process.env,
        ASAN_OPTIONS: 'halt_on_error=1',
      },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function sourceForValidationAllocationFailures() {
  const builder = new EngineFixtureSource();
  const repeatedGroupProperties = builder.emit({
    groups: {
      type: 'group',
      multiple: true,
      properties: { name: { type: 'text' } },
    },
  });
  const repeatedGroupData = builder.emit({ groups: { first: { name: 'first' } } });
  const repeatedFieldProperties = builder.emit({
    tags: { type: 'text', multiple: true },
  });
  const repeatedFieldData = builder.emit({ tags: { first: 'first' } });
  builder.lines.push(
    `  int status = verify_validation_allocation_failures(${repeatedGroupProperties}, ${repeatedGroupData}, 4);`,
    '  if (status) return status;',
    `  status = verify_validation_allocation_failures(${repeatedFieldProperties}, ${repeatedFieldData}, 3);`,
    '  if (status) return 10 + status;',
    `  ps_value_free(${repeatedGroupProperties}); ps_value_free(${repeatedGroupData});`,
    `  ps_value_free(${repeatedFieldProperties}); ps_value_free(${repeatedFieldData});`,
  );
  return fixtureProgram(builder.lines, [
    '#include <ctype.h>',
    '#include <errno.h>',
    '#include <math.h>',
    '#include <strings.h>',
    '#include <time.h>',
    '',
    '/* The specifications of this program declare no pattern rule. */',
    'int ps_pattern_rule(const ps_value *value, const ps_value *parameter)',
    '{',
    '  (void)value; (void)parameter;',
    '  fputs("unexpected pattern rule input\\n", stderr);',
    '  return -1;',
    '}',
    '',
    'static size_t validation_allocation_index;',
    'static size_t validation_fail_at;',
    'static bool validation_allocation_failed;',
    '',
    'static bool validation_should_fail(void)',
    '{',
    '  validation_allocation_index++;',
    '  if (validation_allocation_index != validation_fail_at) return false;',
    '  validation_allocation_failed = true;',
    '  return true;',
    '}',
    '',
    'static void *validation_test_malloc(size_t size)',
    '{ return validation_should_fail() ? NULL : malloc(size); }',
    'static void *validation_test_calloc(size_t count, size_t size)',
    '{ return validation_should_fail() ? NULL : calloc(count, size); }',
    'static void *validation_test_realloc(void *pointer, size_t size)',
    '{ return validation_should_fail() ? NULL : realloc(pointer, size); }',
    '',
    '#define malloc(size) validation_test_malloc(size)',
    '#define calloc(count, size) validation_test_calloc(count, size)',
    '#define realloc(pointer, size) validation_test_realloc(pointer, size)',
    '#include "validation.c"',
    '#undef malloc',
    '#undef calloc',
    '#undef realloc',
    '',
    'static int verify_validation_allocation_failures(',
    '    const ps_value *properties, const ps_value *data, size_t allocation_count)',
    '{',
    '  for (size_t fail_at = 1; fail_at <= allocation_count; ++fail_at) {',
    '    validation_context context = {data, ps_array_value(), NULL};',
    '    if (!context.errors) return 1;',
    '    validation_allocation_index = 0;',
    '    validation_fail_at = fail_at;',
    '    validation_allocation_failed = false;',
    '    bool result = validate_properties(properties, data, &context, NULL, 0);',
    '    validation_fail_at = 0;',
    '    ps_value_free(context.errors);',
    '    if (!validation_allocation_failed) return 2;',
    '    if (result) return 3;',
    '  }',
    '  validation_context context = {data, ps_array_value(), NULL};',
    '  if (!context.errors) return 4;',
    '  validation_allocation_index = 0;',
    '  validation_fail_at = allocation_count + 1;',
    '  validation_allocation_failed = false;',
    '  bool result = validate_properties(properties, data, &context, NULL, 0);',
    '  validation_fail_at = 0;',
    '  ps_value_free(context.errors);',
    '  return result && !validation_allocation_failed ? 0 : 5;',
    '}',
  ]);
}

test('PHP extension validation returns failure after repeated-field allocation failures', { timeout: ENGINE_TEST_BUDGET }, async t => {
  const directory = await mkdtemp(path.join(
    os.tmpdir(), 'crudui-extension-validation-allocation-'));
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForValidationAllocationFailures(),
      name: 'validation-allocation',
      sources: [
        'value.c', 'value_path.c', 'engine_error.c', 'compose.c', 'expression.c',
        'runtime.c',
      ],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
}

{
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtures = JSON.parse(await readFile(
  path.join(root, 'tests/fixtures/form-render/cases.json'), 'utf8'));
const bindFixtures = fixtures.filter(
  fixture => fixture.expectError?.code !== 'REF_FILE_NOT_FOUND');

function sourceForFixtures() {
  const builder = new EngineFixtureSource();
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
      lines.push(`  if (actual.value || !actual.error || !text_is(ps_get(actual.error, "code"), ${cText(expectedError.code)}) || !text_is(ps_get(actual.error, "at"), ${cText(expectedError.at)})) { print_text("error differs: ", ${cText(fixture.name)}); return ${index + 1}; }`);
    } else {
      const expectedValue = builder.emit(expected);
      lines.push(`  if (!actual.value || actual.error || !ps_equal(actual.value, ${expectedValue})) {`);
      lines.push(`    print_text("fields differ: ", ${cText(fixture.name)});`);
      lines.push(`    print_json("actual: ", actual.value); print_json("expected: ", ${expectedValue});`);
      lines.push(`    return ${index + 1}; }`);
      lines.push(`  ps_value_free(${expectedValue});`);
    }
    lines.push(`  if (!ps_equal(${templateValue}, template_before) || !ps_equal(${dataValue}, data_before)) { print_text("input changed: ", ${cText(fixture.name)}); return ${index + 1}; }`);
    lines.push(`  ps_value_free(template_before); ps_value_free(data_before); ps_value_free(actual.value); ps_value_free(actual.error); ps_value_free(${templateValue}); ps_value_free(${dataValue}); ps_value_free(${optionsValue});`, '  }');
  });
  const template = dispatch({ operation: 'compileForm', spec: { type: 'group', properties: { name: { type: 'text' } } }, options: {} });
  const optionRejections = [
    [{ language: 'fr' }, 'Unsupported language: fr'], [{ language: '' }, 'Unsupported language: '],
    [{ language: 5 }, 'Language must be a string'], [{ language: false }, 'Language must be a string'],
    [{ language: ['ko'] }, 'Language must be a string'], [{ language: { ko: 'ko' } }, 'Language must be a string'],
    [{ unsupported: true }, 'unsupported must be throw or marker'],
    [{ language: 'fr', unsupported: 'other' }, 'unsupported must be throw or marker'],
  ];
  optionRejections.forEach(([options, message], index) => {
    let languageError;
    try { dispatch({ operation: 'bindForm', template, data: {}, options }); }
    catch (error) { languageError = errorRecord(error); }
    assert.deepEqual(languageError, { code: 'INVALID_FORM_INPUT', message, at: '' });
    lines.push('  {', `  /* option-rejection-${index} */`);
    const templateValue = builder.emit(JSON.parse(JSON.stringify(template)));
    const dataValue = builder.emit({});
    const optionsValue = builder.emit(options);
    lines.push(`  ps_result actual = ps_bind_form(${templateValue}, ${dataValue}, ${optionsValue});`);
    lines.push(`  if (actual.value || !actual.error || !text_is(ps_get(actual.error, "code"), ${cText(languageError.code)}) || !text_is(ps_get(actual.error, "message"), ${cText(languageError.message)}) || !text_is(ps_get(actual.error, "at"), PS_TEXT(""))) { print_text("error differs: ", ${cText(`option-rejection-${index}`)}); return ${bindFixtures.length + 1 + index}; }`);
    lines.push(`  ps_value_free(actual.error); ps_value_free(${templateValue}); ps_value_free(${dataValue}); ps_value_free(${optionsValue});`, '  }');
  });
  return fixtureProgram(lines);
}

test('PHP extension engine binds every shared form fixture without changing inputs', { timeout: ENGINE_TEST_BUDGET }, async t => {
  assert.equal(fixtures.length, 93,
    'Review C binding coverage when the shared fixture inventory changes');
  assert.equal(bindFixtures.length, 92,
    'Review C binding coverage when compilation error fixtures change');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-bind-'));
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForFixtures(), name: 'bind-fixtures',
      sources: [
        'value.c', 'value_path.c', 'engine_error.c', 'expression.c',
        'runtime.c', 'date.c', 'design.c', 'widget.c', 'messages.c', 'binding.c',
      ],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('PHP extension engine binding has no undefined behavior findings', { timeout: ENGINE_SANITIZER_BUDGET }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-bind-sanitize-'));
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForFixtures(), name: 'bind-fixtures-sanitize',
      sources: [
        'value.c', 'value_path.c', 'engine_error.c', 'expression.c',
        'runtime.c', 'date.c', 'design.c', 'widget.c', 'messages.c', 'binding.c',
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

function sourceForWidgetConstructionFailure() {
  const builder = new EngineFixtureSource();
  const template = builder.emit(JSON.parse(JSON.stringify(dispatch({
    operation: 'compileForm',
    spec: { type: 'group', properties: { title: { type: 'text' } } },
    options: {},
  }))));
  const data = builder.emit({});
  const options = builder.emit({});
  const declarations = [
    'bool ps_widget_supported(ps_text type)',
    '{',
    '  return ps_text_is(type, "text");',
    '}',
    '',
    'ps_value *ps_widget(const ps_value *spec, const ps_value *value, bool value_present,',
    '                    ps_text path, const ps_value *design, ps_text key_prefix,',
    '                    ps_text id_prefix, ps_text language,',
    '                    const size_t *row_segments, size_t row_count)',
    '{',
    '  (void)spec; (void)value; (void)value_present; (void)path; (void)design;',
    '  (void)key_prefix; (void)id_prefix; (void)language;',
    '  (void)row_segments; (void)row_count;',
    '  return NULL;',
    '}',
    '',
  ];
  builder.lines.push(
    `  ps_result result = ps_bind_form(${template}, ${data}, ${options});`,
    '  if (result.value || !result.error ||',
    '      !ps_is_string(ps_get(result.error, "code"), "INTERNAL_ERROR")) return 1;',
    '  ps_value_free(result.error);',
    `  ps_value_free(${template}); ps_value_free(${data}); ps_value_free(${options});`,
  );
  return fixtureProgram(builder.lines, declarations);
}

test('PHP extension engine reports supported widget construction failures as internal errors', { timeout: ENGINE_TEST_BUDGET }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-widget-failure-'));
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForWidgetConstructionFailure(), name: 'widget-failure',
      sources: [
        'value.c', 'value_path.c', 'engine_error.c', 'expression.c',
        'runtime.c', 'date.c', 'design.c', 'messages.c', 'binding.c',
      ],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
}

{
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
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
    'div', { className: 'crudui-form' },
    createElement('div', { className: 'crudui-form__body' },
      fields.map(vm => createElement(Node, { key: vm.path, vm }))),
  ));
}

function sourceForFixtures() {
  const builder = new EngineFixtureSource();
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
    lines.push('  ps_chars actual = ps_render_fields(fields.value);');
    lines.push(`  if (!actual.bytes || !ps_text_equal(ps_view(actual), ${cText(expectedHtml)})) {`);
    lines.push(`    print_text("HTML differs: ", ${cText(fixture.name)});`);
    lines.push(`    print_text("actual: ", actual.bytes ? ps_view(actual) : PS_TEXT("null")); print_text("expected: ", ${cText(expectedHtml)});`);
    lines.push(`    free(actual.bytes); return ${index + 1}; }`);
    lines.push(`  if (!fields_before || !ps_equal(fields.value, fields_before)) { print_text("fields changed: ", ${cText(fixture.name)}); return ${index + 1}; }`);
    lines.push(`  free(actual.bytes); ps_value_free(fields_before); ps_value_free(fields.value); ps_value_free(fields.error); ps_value_free(${templateValue}); ps_value_free(${dataValue}); ps_value_free(${optionsValue});`, '  }');
  });
  return fixtureProgram(lines);
}

test('PHP extension engine renders successful shared form fixtures and edge cases as exact HTML', { timeout: ENGINE_TEST_BUDGET }, async t => {
  assert.equal(fixtures.length, 93,
    'Review C rendering coverage when the shared fixture inventory changes');
  assert.equal(renderFixtures.length, 91,
    'Review C rendering coverage when successful fixtures change');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-render-'));
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForFixtures(), name: 'render-fixtures',
      sources: [
        'value.c', 'value_path.c', 'engine_error.c', 'expression.c',
        'runtime.c', 'date.c', 'design.c', 'widget.c', 'messages.c', 'binding.c', 'html.c', 'render.c',
      ],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('PHP extension engine form rendering has no undefined behavior findings', { timeout: ENGINE_SANITIZER_BUDGET }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-render-sanitize-'));
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForFixtures(), name: 'render-fixtures-sanitize',
      sources: [
        'value.c', 'value_path.c', 'engine_error.c', 'expression.c',
        'runtime.c', 'date.c', 'design.c', 'widget.c', 'messages.c', 'binding.c', 'html.c', 'render.c',
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
}

{
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtures = JSON.parse(await readFile(
  path.join(root, 'tests/fixtures/list-render/cases.json'), 'utf8'));
const additionalFixtures = [
  imageCase,
  urlCase,
  ...numberCases.map((item, index) => ({
    name: `number-${index}`,
    spec: {
      columns: {
        number: {
          field: 'number',
          format: {
            type: 'number',
            ...(Object.hasOwn(item, 'decimals') ? { decimals: item.decimals } : {}),
          },
        },
      },
    },
    rows: [{ number: item.value }],
  })),
  {
    name: 'date-values',
    spec: dateListSpec,
    rows: dateCases.map(item => ({ value: item.value })),
  },
];
const listFixtures = [...fixtures, ...additionalFixtures];

function sourceForFixtures() {
  const builder = new EngineFixtureSource();
  const { lines } = builder;
  listFixtures.forEach((fixture, index) => {
    const options = fixture.options ?? {};
    let expected;
    let expectedError;
    try {
      expected = dispatch({
        operation: 'renderList', spec: fixture.spec, rows: fixture.rows ?? [], options,
      });
    } catch (error) {
      expectedError = errorRecord(error);
    }
    lines.push('  {', `  /* ${fixture.name} */`);
    const specValue = builder.emit(fixture.spec);
    const rowsValue = builder.emit(fixture.rows ?? []);
    const optionsValue = builder.emit(options);
    lines.push(`  ps_value *spec_before = ps_value_clone(${specValue});`);
    lines.push(`  ps_value *rows_before = ps_value_clone(${rowsValue});`);
    lines.push(`  ps_value *options_before = ps_value_clone(${optionsValue});`);
    lines.push(`  ps_result actual = ps_render_list(${specValue}, ${rowsValue}, ${optionsValue});`);
    if (expectedError) {
      lines.push(`  if (actual.value || !actual.error || !text_is(ps_get(actual.error, "code"), ${cText(expectedError.code)}) || !text_is(ps_get(actual.error, "message"), ${cText(expectedError.message)}) || !text_is(ps_get(actual.error, "at"), ${cText(expectedError.at)})) { print_text("error differs: ", ${cText(fixture.name)}); return ${index + 1}; }`);
    } else {
      lines.push(`  if (!actual.value || actual.error || !text_is(actual.value, ${cText(expected)})) {`);
      lines.push(`    print_text("HTML differs: ", ${cText(fixture.name)});`);
      lines.push(`    print_text("actual: ", actual.value ? ps_string(actual.value) : PS_TEXT("null")); print_text("expected: ", ${cText(expected)});`);
      lines.push(`    return ${index + 1}; }`);
    }
    lines.push(`  if (!spec_before || !rows_before || !options_before || !ps_equal(${specValue}, spec_before) || !ps_equal(${rowsValue}, rows_before) || !ps_equal(${optionsValue}, options_before)) { print_text("input changed: ", ${cText(fixture.name)}); return ${index + 1}; }`);
    lines.push(`  ps_value_free(spec_before); ps_value_free(rows_before); ps_value_free(options_before); ps_value_free(actual.value); ps_value_free(actual.error); ps_value_free(${specValue}); ps_value_free(${rowsValue}); ps_value_free(${optionsValue});`, '  }');
  });
  return fixtureProgram(lines);
}

const sources = [
  'value.c', 'value_path.c', 'engine_error.c', 'expression.c',
  'runtime.c', 'date.c', 'design.c', 'compose.c', 'declaration.c', 'html.c', 'list.c',
];

test('PHP extension engine renders the complete list target as exact HTML', { timeout: ENGINE_TEST_BUDGET }, async t => {
  assert.equal(fixtures.length, 58,
    'Review C list coverage when the shared fixture inventory changes');
  assert.equal(numberCases.length, 17,
    'Review C number coverage when the native number inventory changes');
  assert.equal(dateCases.length, 28,
    'Review C date coverage when the native date inventory changes');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-list-'));
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForFixtures(), name: 'list-fixtures', sources,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('PHP extension engine list rendering has no undefined behavior findings', { timeout: ENGINE_SANITIZER_BUDGET }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-list-sanitize-'));
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForFixtures(), name: 'list-fixtures-sanitize', sources,
      compilerFlags: ['-fsanitize=undefined', '-fno-omit-frame-pointer'],
      runEnvironment: { ...process.env, UBSAN_OPTIONS: 'halt_on_error=1' },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
}

{
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtures = JSON.parse(await readFile(
  path.join(root, 'tests/fixtures/detail-render/cases.json'), 'utf8'));
const fieldMembers = ['key', 'label', 'format', 'value', 'display', 'design'];

function expectation(operation, fixture) {
  const record = fixture.record ?? {};
  const options = fixture.options ?? {};
  try {
    if (operation === 'render')
      return { value: dispatch({ operation: 'renderDetail', spec: fixture.spec, record, options }) };
    const model = buildDetail(fixture.spec, record, options);
    return {
      value: JSON.parse(JSON.stringify({
        fields: model.fields.map(field => Object.fromEntries(fieldMembers.map(
          key => [key, key === 'value' && field.value === undefined ? null : field[key]]))),
        design: model.design,
      })),
    };
  } catch (error) {
    return { error: errorRecord(error) };
  }
}

function sourceForFixtures() {
  const builder = new EngineFixtureSource();
  const { lines } = builder;
  let status = 1;
  for (const fixture of fixtures) {
    for (const operation of ['render', 'build']) {
      const name = `${operation}:${fixture.name}`;
      const { value: expected, error } = expectation(operation, fixture);
      if (fixture.expectError) assert.deepEqual(error, { ...fixture.expectError, at: '' });
      lines.push('  {', `  /* ${name} */`);
      const specValue = builder.emit(fixture.spec);
      const recordValue = builder.emit(fixture.record ?? {});
      const optionsValue = builder.emit(fixture.options ?? {});
      const inputs = [specValue, recordValue, optionsValue];
      lines.push(...inputs.map(value => `  ps_value *${value}_before = ps_value_clone(${value});`));
      lines.push(`  ps_result actual = ps_${operation}_detail(${inputs.join(', ')});`);
      if (error) {
        lines.push(`  if (actual.value || !actual.error || !text_is(ps_get(actual.error, "code"), ${cText(error.code)}) || !text_is(ps_get(actual.error, "message"), ${cText(error.message)}) || !text_is(ps_get(actual.error, "at"), ${cText(error.at)})) { print_text("error differs: ", ${cText(name)}); return ${status}; }`);
      } else if (operation === 'render') {
        lines.push(`  if (!actual.value || actual.error || !text_is(actual.value, ${cText(expected)})) {`);
        lines.push(`    print_text("HTML differs: ", ${cText(name)});`);
        lines.push(`    print_text("actual: ", actual.value ? ps_string(actual.value) : PS_TEXT("null")); print_text("expected: ", ${cText(expected)});`);
        lines.push(`    return ${status}; }`);
      } else {
        const expectedValue = builder.emit(expected);
        lines.push(`  if (!actual.value || actual.error || !ps_equal(actual.value, ${expectedValue})) {`);
        lines.push(`    print_text("model differs: ", ${cText(name)});`);
        lines.push(`    print_json("actual: ", actual.value); print_json("expected: ", ${expectedValue});`);
        lines.push(`    return ${status}; }`);
        lines.push(`  if (!member_order(actual.value, (const char *[]){"fields", "design"}, 2)) { print_text("model member order differs: ", ${cText(name)}); return ${status}; }`);
        lines.push(`  for (size_t i = 0; i < ps_size(ps_get(actual.value, "fields")); ++i)`);
        lines.push(`    if (!member_order(ps_at(ps_get(actual.value, "fields"), i), (const char *[]){${fieldMembers.map(cString).join(', ')}}, ${fieldMembers.length})) { print_text("field member order differs: ", ${cText(name)}); return ${status}; }`);
        lines.push(`  ps_value_free(${expectedValue});`);
      }
      lines.push(`  if (${inputs.map(value => `!ps_equal(${value}, ${value}_before)`).join(' || ')}) { print_text("input changed: ", ${cText(name)}); return ${status}; }`);
      lines.push(`  ps_value_free(actual.value); ps_value_free(actual.error);`);
      lines.push(...inputs.map(value => `  ps_value_free(${value}); ps_value_free(${value}_before);`), '  }');
      status += 1;
    }
  }
  return fixtureProgram(lines, [
    'static bool member_order(const ps_value *object, const char *const *keys, size_t count)',
    '{',
    '  if (!object || ps_size(object) != count) return false;',
    '  for (size_t i = 0; i < count; ++i) if (!ps_text_is(ps_key(object, i), keys[i])) return false;',
    '  return true;',
    '}',
    '',
  ]);
}

const sources = [
  'value.c', 'value_path.c', 'engine_error.c', 'expression.c',
  'runtime.c', 'date.c', 'design.c', 'compose.c', 'declaration.c', 'html.c', 'list.c',
];

test('PHP extension engine renders and builds every shared detail fixture', { timeout: ENGINE_TEST_BUDGET }, async t => {
  assert.equal(fixtures.length, 31,
    'Review C detail coverage when the shared fixture inventory changes');
  const missing = expectation('build', fixtures.find(fixture => fixture.name === 'missing-value'));
  assert.equal(missing.value.fields[0].value, null);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-detail-'));
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForFixtures(), name: 'detail-fixtures', sources,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('PHP extension engine detail evaluation has no undefined behavior findings', { timeout: ENGINE_SANITIZER_BUDGET }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-detail-sanitize-'));
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForFixtures(), name: 'detail-fixtures-sanitize', sources,
      compilerFlags: ['-fsanitize=undefined', '-fno-omit-frame-pointer'],
      runEnvironment: { ...process.env, UBSAN_OPTIONS: 'halt_on_error=1' },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
}

{
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function sourceForKeys() {
  return [
    '#include "engine_internal.h"',
    '#include <stdint.h>',
    '#include <string.h>',
    '',
    'int main(void)',
    '{',
    '  ps_value *integer = ps_int_value(INT64_C(7));',
    '  ps_result result = ps_sequence_key(integer);',
    '  if (result.error || !ps_is_string(result.value, "__0000000000007__")) return 1;',
    '  ps_value_free(result.value); ps_value_free(integer);',
    '  ps_value *digits = ps_string_value("1234567890123");',
    '  result = ps_sequence_key(digits);',
    '  if (result.error || !ps_is_string(result.value, "__1234567890123__")) return 2;',
    '  ps_value_free(result.value); ps_value_free(digits);',
    '  ps_value *invalid[] = {',
    '    ps_int_value(-1), ps_int_value(INT64_C(10000000000000)),',
    '    ps_float_value(1.0), ps_string_value(""),',
    '    ps_string_value("12345678901234"), ps_string_value("12a")',
    '  };',
    '  for (size_t i = 0; i < sizeof(invalid) / sizeof(invalid[0]); ++i) {',
    '    result = ps_sequence_key(invalid[i]);',
    '    if (result.value || !result.error ||',
    '        !ps_is_string(ps_get(result.error, "code"), "INVALID_FORM_INPUT")) return 3;',
    '    ps_value_free(result.error); ps_value_free(invalid[i]);',
    '  }',
    '  char generated[64][18];',
    '  for (size_t i = 0; i < 64; ++i) {',
    '    result = ps_create_key();',
    '    if (result.error || !result.value || result.value->kind != PS_STRING ||',
    '        result.value->data.string.length != 17) return 4;',
    '    const char *key = ps_string(result.value).bytes;',
    "    if (key[0] != '_' || key[1] != '_' || key[15] != '_' || key[16] != '_') return 5;",
    "    for (size_t j = 2; j < 15; ++j)",
    "      if (!((key[j] >= '0' && key[j] <= '9') ||",
    "            (key[j] >= 'a' && key[j] <= 'f'))) return 6;",
    '    memcpy(generated[i], key, 18);',
    '    for (size_t j = 0; j < i; ++j) if (!strcmp(generated[j], generated[i])) return 7;',
    '    ps_value_free(result.value);',
    '  }',
    '  return 0;',
    '}',
    '',
  ].join('\n');
}

test('PHP extension engine creates and formats row keys', { timeout: ENGINE_TEST_BUDGET }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-key-'));
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForKeys(), name: 'key',
      sources: ['value.c', 'engine_error.c', 'key.c'],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
}

{
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function sourceForFormState() {
  const fixture = new EngineFixtureSource();
  const spec = fixture.emit({
    type: 'group',
    properties: {
      companies: {
        type: 'group', multiple: { max: 3 },
        properties: {
          name: { type: 'text' },
          stores: {
            type: 'group', multiple: true,
            properties: {
              name: { type: 'text', default: 'Default' },
              departments: {
                type: 'group', multiple: true,
                properties: { name: { type: 'text' } },
              },
            },
          },
        },
      },
    },
  });
  const data = fixture.emit({
    companies: {
      row_a: {
        name: 'Company',
        stores: {
          store_a: {
            name: 'Store',
            departments: { dept_a: { name: 'Sales' } },
          },
        },
      },
    },
  });
  const compileOptions = fixture.emit({});
  const formOptions = fixture.emit({ idPrefix: "scope:'한글" });
  fixture.lines.push(
    '  ps_result compiled = ps_compile_form(' + spec + ', ' + compileOptions + ');',
    '  if (compiled.error || !compiled.value) return 1;',
    '  ps_form_result created = ps_form_new(compiled.value, ' + data + ', ' + formOptions + ');',
    '  if (created.error || !created.form) return 2;',
    '  ps_form *form = created.form;',
    '  ps_result result = ps_form_read(form, 3);',
    '  if (result.error || !result.value || result.value->kind != PS_INT ||',
    '      result.value->data.integer != 0) return 3;',
    '  ps_value_free(result.value);',
    '  ps_value *args = ps_array_value();',
    '  push(args, ps_string_value("companies.row_a.stores.store_a.name"));',
    '  push(args, ps_string_value("Changed"));',
    '  result = ps_form_apply(form, 2, args); ps_value_free(args);',
    '  if (result.error || !result.value || result.value->kind != PS_NULL) return 4;',
    '  ps_value_free(result.value);',
    '  ps_value *copy_options = ps_object_value();',
    '  put(copy_options, PS_TEXT("key"), ps_string_value("store_copy"));',
    '  args = ps_array_value();',
    '  push(args, ps_string_value("companies.row_a.stores"));',
    '  push(args, ps_string_value("store_a"));',
    '  push(args, copy_options);',
    '  result = ps_form_apply(form, 4, args); ps_value_free(args);',
    '  if (result.error || !ps_is_string(result.value, "store_copy")) return 5;',
    '  ps_value_free(result.value);',
    '  result = ps_form_read(form, 1);',
    '  const ps_value *copied = ps_path(result.value, PS_TEXT("companies.row_a.stores.store_copy"));',
    '  const ps_value *departments = copied ? ps_get(copied, "departments") : NULL;',
    '  if (!copied || !ps_is_string(ps_get(copied, "name"), "Changed") ||',
    '      !departments || departments->kind != PS_OBJECT || ps_size(departments) != 1 ||',
    '      ps_text_is(ps_key(departments, 0), "dept_a")) return 6;',
    '  ps_value_free(result.value);',
    '  args = ps_array_value();',
    '  push(args, ps_string_value("companies.row_a.stores"));',
    '  push(args, ps_string_value("store_copy"));',
    '  push(args, ps_string_value("__0000000000042__"));',
    '  result = ps_form_apply(form, 7, args); ps_value_free(args);',
    '  if (result.error) return 7;',
    '  ps_value_free(result.value);',
    '  args = ps_array_value();',
    '  push(args, ps_string_value("companies.row_a.stores"));',
    '  push(args, ps_string_value("__0000000000042__"));',
    '  push(args, ps_int_value(0));',
    '  result = ps_form_apply(form, 6, args); ps_value_free(args);',
    '  if (result.error) return 8;',
    '  ps_value_free(result.value);',
    '  result = ps_form_read(form, 1);',
    '  const ps_value *stores = ps_path(result.value, PS_TEXT("companies.row_a.stores"));',
    '  if (!stores || !ps_text_is(ps_key(stores, 0), "__0000000000042__")) return 9;',
    '  ps_value *before = result.value;',
    '  result = ps_form_read(form, 3);',
    '  int64_t revision = result.value->data.integer; ps_value_free(result.value);',
    '  ps_value *duplicate = ps_object_value();',
    '  put(duplicate, PS_TEXT("key"), ps_string_value("__0000000000042__"));',
    '  args = ps_array_value();',
    '  push(args, ps_string_value("companies.row_a.stores")); push(args, duplicate);',
    '  result = ps_form_apply(form, 3, args); ps_value_free(args);',
    '  if (result.value || !result.error ||',
    '      !ps_is_string(ps_get(result.error, "code"), "INVALID_FORM_INPUT")) return 10;',
    '  ps_value_free(result.error);',
    '  result = ps_form_read(form, 1);',
    '  if (!ps_equal(before, result.value)) return 11;',
    '  ps_value_free(result.value); ps_value_free(before);',
    '  result = ps_form_read(form, 3);',
    '  if (result.value->data.integer != revision) return 12;',
    '  ps_value_free(result.value);',
    '  ps_form *clone = ps_form_clone(form); if (!clone) return 13;',
    '  args = ps_array_value(); push(args, ps_string_value("companies.row_a.name"));',
    '  push(args, ps_string_value("Clone"));',
    '  result = ps_form_apply(clone, 2, args); ps_value_free(args);',
    '  if (result.error) return 14;',
    '  ps_value_free(result.value);',
    '  args = ps_array_value(); push(args, ps_string_value("companies.row_a.name"));',
    '  result = ps_form_apply(form, 0, args); ps_value_free(args);',
    '  if (!ps_is_string(result.value, "Company")) return 15;',
    '  ps_value_free(result.value);',
    '  result = ps_form_read(form, 4);',
    '  if (result.error || !result.value || result.value->kind != PS_STRING ||',
    '      ps_text_find(ps_string(result.value),',
    '                   PS_TEXT("companies[row_a][stores][__0000000000042__][name]"), 0) == SIZE_MAX) return 16;',
    '  ps_value_free(result.value); ps_form_free(clone); ps_form_free(form);',
    '  ps_value *explicit_empty = ps_object_value();',
    '  put(explicit_empty, PS_TEXT("companies"), ps_object_value());',
    '  created = ps_form_new(compiled.value, explicit_empty, ' + formOptions + ');',
    '  if (created.error || !created.form) return 17;',
    '  result = ps_form_read(created.form, 1);',
    '  if (!ps_get(result.value, "companies") ||',
    '      ps_size(ps_get(result.value, "companies")) != 0) return 18;',
    '  ps_value_free(result.value); ps_form_free(created.form);',
    '  ps_value_free(explicit_empty);',
    '  ps_value *invalid = ps_object_value();',
    '  put(invalid, PS_TEXT("companies"), ps_array_value());',
    '  created = ps_form_new(compiled.value, invalid, ' + formOptions + ');',
    '  if (created.form || !created.error ||',
    '      !ps_is_string(ps_get(created.error, "code"), "INVALID_FORM_INPUT")) return 19;',
    '  ps_value_free(created.error); ps_value_free(invalid);',
    '  ps_value_free(compiled.value);',
    '  ps_value_free(' + spec + '); ps_value_free(' + data + ');',
    '  ps_value_free(' + compileOptions + '); ps_value_free(' + formOptions + ');',
  );
  return fixtureProgram(fixture.lines);
}

test('PHP extension engine updates form state atomically', { timeout: ENGINE_TEST_BUDGET }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-extension-form-'));
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForFormState(), name: 'form-state',
      sources: [
        'value.c', 'value_path.c', 'engine_error.c', 'compose.c', 'declaration.c', 'template.c',
        'expression.c', 'runtime.c', 'date.c', 'design.c', 'widget.c',
        'messages.c', 'binding.c', 'html.c', 'render.c', 'key.c', 'form.c',
      ],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
}

{
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('PHP extension engine compiles composed form templates', { timeout: ENGINE_TEST_BUDGET }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-template-'));
  try {
    const executable = path.join(directory, 'template-test');
    const extensionSource = file => path.join(root, 'packages/php-ext/src', file);
    const compile = await runStep('template-test: compiling 5 sources', process.env.CC ?? 'cc', [
      '-std=c11', '-Wall', '-Wextra', '-Werror', '-pedantic',
      '-I', path.join(root, 'packages/php-ext/src'),
      extensionSource('value.c'), extensionSource('engine_error.c'),
      extensionSource('compose.c'), extensionSource('declaration.c'), extensionSource('template.c'),
      path.join(root, 'packages/php-ext/tests/template.c'), '-o', executable,
    ], { signal: t.signal });
    assert.equal(compile.signal, null);
    assert.equal(compile.status, 0, compile.stderr || compile.stdout);
    const run = await runStep('template-test: running', executable, [], { signal: t.signal });
    assert.equal(run.signal, null);
    assert.equal(run.status, 0, run.stderr || run.stdout);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
}

{
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('PHP extension engine value model preserves order and owns independent values', { timeout: ENGINE_TEST_BUDGET }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-value-'));
  try {
    const executable = path.join(directory, 'value-test');
    const compiler = process.env.CC ?? 'cc';
    const compile = await runStep('value-test: compiling 2 sources', compiler, [
      '-std=c11', '-Wall', '-Wextra', '-Werror', '-pedantic',
      '-I', path.join(root, 'packages/php-ext/src'),
      path.join(root, 'packages/php-ext/src/value.c'),
      path.join(root, 'packages/php-ext/tests/value.c'),
      '-o', executable,
    ], { signal: t.signal });
    assert.equal(compile.signal, null);
    assert.equal(compile.status, 0, compile.stderr || compile.stdout);
    const run = await runStep('value-test: running', executable, [], { signal: t.signal });
    assert.equal(run.signal, null);
    assert.equal(run.status, 0, run.stderr || run.stdout);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
}

{
const root = new URL('../../../', import.meta.url);
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

test('PHP modules use the shared builder through explicit entry points', { timeout: ENGINE_INSPECTION_BUDGET }, async () => {
  const common = 'scripts/php-extension-builder.mjs';
  const crudui = 'scripts/build-crudui-php-extension.mjs';
  const orderedJson = 'scripts/build-ordered-json-php-extension.mjs';
  const comparisonTarget = id => buildTargets.find(target => target.id === id);
  const cruduiTarget = comparisonTarget('crudui-php-extension');
  const orderedJsonTarget = comparisonTarget('ordered-json-php-extension');
  for (const [target, filenames] of [
    [cruduiTarget, [common, crudui]], [orderedJsonTarget, [common, orderedJson]],
  ]) {
    for (const filename of filenames) {
      await access(new URL(filename, root));
      assert.ok(target.inputs.includes(filename),
        'The form comparison ' + target.id + ' build must rebuild when ' + filename + ' changes');
    }
    assert.deepEqual(target.restarts, ['php-ext']);
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

  // The comparison toolchain image contains no source; its supervisor builds both modules
  // from the mounted repository with the declared php-config.
  const commandLine = step => [step.command, ...step.args].join(' ');
  assert.deepEqual(cruduiTarget.steps.map(commandLine),
    ['node scripts/build-crudui-php-extension.mjs --php-config /usr/bin/php-config8.4']);
  assert.deepEqual(orderedJsonTarget.steps.map(commandLine), [
    'node scripts/build-ordered-json-php-extension.mjs --php-config /usr/bin/php-config8.4'
      + ' --source /workspace/build/tree/.form-comparison/sources/ordered-json/php-extension/src',
  ]);
  const toolchain = normalized(files['examples/form-comparison/Containerfile']);
  assert.doesNotMatch(toolchain, /scripts\/build-|phpize|autoconf|libtool/i);
  for (const step of [...cruduiTarget.steps, ...orderedJsonTarget.steps]) {
    assert.doesNotMatch(commandLine(step), /phpize|autoconf|libtool|--cc /i);
  }
  assert.doesNotMatch(normalized(files['tests/containers/native.Containerfile']),
    /--cc \/usr\/bin\/gcc-14/);

  for (const removed of [
    'packages/php-ext/config.m4',
    'scripts/build-php-extension.sh',
    'scripts/build-php-extension.mjs',
  ]) {
    assert.equal(buildTargets.some(target => target.inputs.includes(removed)), false);
    await assert.rejects(access(new URL(removed, root)));
  }
});

test('container context excludes direct PHP extension build output', { timeout: ENGINE_INSPECTION_BUDGET }, () => {
  assert.match(files['.dockerignore'], /^packages\/php-ext\/\.build\/$/m);
  assert.match(files['.dockerignore'], /^packages\/php-ext\/modules\/?$/m);
});

test('PHP extension instructions use the current direct build entry point', { timeout: ENGINE_INSPECTION_BUDGET }, () => {
  for (const filename of ['packages/php-ext/README.md', 'packages/php-ext/README.ko.md']) {
    assert.match(files[filename], /node scripts\/build-crudui-php-extension\.mjs/);
    assert.doesNotMatch(files[filename], /sh scripts\/build-php-extension\.sh/);
  }
});

test('CRUDUI PHP extension package contains one C implementation', { timeout: ENGINE_INSPECTION_BUDGET }, async () => {
  const sourceRoot = new URL('packages/php-ext/', root);
  const generated = new Set(['.build', '.libs', 'autom4te.cache', 'build', 'include',
    'modules', 'target']);
  const prohibited = [];
  async function inspect(directory, relative = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
      const filename = path.posix.join(relative, entry.name);
      if (entry.isDirectory() && !generated.has(entry.name)) await inspect(child, filename);
      else if (entry.isFile() && (entry.name === 'Cargo.toml'
        || entry.name === 'Cargo.lock' || entry.name.endsWith('.rs'))) prohibited.push(filename);
    }
  }
  await inspect(sourceRoot);
  prohibited.sort();
  assert.deepEqual(prohibited, []);
  assert.equal(buildTargets.find(target => target.id === 'crudui-php-extension').steps
    .some(step => step.command === 'cargo'), false);
  assert.doesNotMatch(
    files['scripts/build-crudui-php-extension.mjs'],
    /\b(?:cargo|rustc|rustdoc|Rust)\b/,
  );
  for (const filename of ['packages/php-ext/README.md', 'packages/php-ext/README.ko.md']) {
    assert.doesNotMatch(files[filename], /\b(?:Cargo|Rust|rustc|rustdoc)\b/);
  }
});
}
