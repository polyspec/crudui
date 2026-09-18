import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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

/*
 * A C string of the UTF-8 bytes of a value followed by a zero byte; a NUL character is a zero byte
 * in it. Text longer than the 4095 bytes ISO C requires of a string literal is a character array.
 */
export function cString(value) {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length > 4000) return `((const char[]){${[...bytes, 0].join(',')}})`;
  return `"${[...bytes].map(byte => `\\${byte.toString(8).padStart(3, '0')}`).join('')}"`;
}

/* The same bytes as engine text with their explicit length. */
export function cText(value) {
  return `((ps_text)${cTextInitializer(value)})`;
}

/* Engine text as a brace initializer: a static table member must not be a compound literal. */
export function cTextInitializer(value) {
  return `{${cString(value)}, ${Buffer.byteLength(value, 'utf8')}}`;
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
  ['crudui_locale_start', [
      '/*',
      ' * With CRUDUI_COMMA_LOCALE set, switch to the environment locale and prove that it writes and',
      ' * reads a comma decimal separator, so the checks that follow run under it.',
      ' */',
      'static void crudui_locale_start(void)',
      '{',
      '  if (!getenv("CRUDUI_COMMA_LOCALE")) return;',
      '  char text[16];',
      '  if (!setlocale(LC_ALL, "") || strcmp(localeconv()->decimal_point, ",") || strtod("1.5", NULL) == 1.5 ||',
      '      snprintf(text, sizeof(text), "%.1f", 1.5) != 3 || strcmp(text, "1,5"))',
      '  { fputs("the comma decimal locale is not active\\n", stderr); exit(98); }',
      '}',
  ]],
  ['put', [
      'static void put(ps_value *object, ps_text key, ps_value *value)',
      '{ if (!value || !ps_set_text(object, key, value)) { fputs("fixture allocation failed\\n", stderr); abort(); } }',
  ]],
  ['push', [
      'static void push(ps_value *array, ps_value *value)',
      '{ if (!value || !ps_append(array, value)) { fputs("fixture allocation failed\\n", stderr); abort(); } }',
  ]],
  ['ps_text_value_checked', [
      'static ps_value *ps_text_value_checked(ps_text text)',
      '{ ps_value *value = ps_text_value(text); if (!value) { fputs("fixture string allocation failed\\n", stderr); abort(); } return value; }',
  ]],
  ['text_is', [
      '/* A string value with exactly these bytes. */',
      'static bool text_is(const ps_value *value, ps_text text)',
      '{ return value && value->kind == PS_STRING && ps_text_equal(ps_string(value), text); }',
  ]],
  ['print_text', [
      '/* Write text with every byte, including NUL characters, to standard error. */',
      'static void print_text(const char *label, ps_text text)',
      '{ fputs(label, stderr); fwrite(text.bytes, 1, text.length, stderr); fputc(\'\\n\', stderr); }',
  ]],
  ['print_json', [
      'static void print_json(const char *label, const ps_value *value)',
      '{ ps_chars json = ps_json_string(value); print_text(label, json.bytes ? ps_view(json) : PS_TEXT("null")); free(json.bytes); }',
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

export function fixtureProgram(body, declarations = [], { explicitLocale = false } = {}) {
  // A helper is included when the program or an included helper calls it; every program can run
  // under a comma decimal locale (commaLocaleEnvironment).
  let used = [...declarations, ...body, 'crudui_locale_start('].join('\n');
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
    '#include <locale.h>',
    '#include <stdio.h>',
    '#include <stdlib.h>',
    '#include <string.h>',
    '',
    ...helpers,
    '',
    ...declarations,
    'int main(void)',
    '{',
    ...(explicitLocale ? [] : ['  crudui_locale_start();']),
    ...body,
    '  return 0;',
    '}',
    '',
  ].join('\n');
}

/*
 * The environment of a program run under a locale whose decimal separator is a comma. macOS has
 * de_DE.UTF-8; a Linux toolchain without locale data gets a locale compiled into the directory
 * from a definition that sets only the numeric category.
 */
export async function commaLocaleEnvironment(directory, signal) {
  if (process.platform === 'darwin') {
    const listed = await runStep('comma locale: listing', 'locale', ['-a'], { signal });
    assert.match(listed.stdout, /^de_DE\.UTF-8$/m, 'macOS provides the de_DE.UTF-8 locale');
    return { ...process.env, CRUDUI_COMMA_LOCALE: '1', LC_ALL: 'de_DE.UTF-8' };
  }
  const source = path.join(directory, 'comma-locale');
  const charmap = path.join(directory, 'ascii.charmap');
  const locales = path.join(directory, 'locales');
  await writeFile(source, 'LC_NUMERIC\ndecimal_point "<U002C>"\nthousands_sep "<U002E>"\ngrouping 3\nEND LC_NUMERIC\n');
  const characters = [];
  for (let code = 0; code < 128; code += 1) {
    const hex = code.toString(16).padStart(2, '0');
    characters.push(`<U00${hex.toUpperCase()}> /x${hex} CHARACTER ${code}`);
  }
  await writeFile(charmap, ['<code_set_name> CRUDUI-ASCII', '<comment_char> %', '<escape_char> /',
    '<mb_cur_min> 1', '<mb_cur_max> 1', 'CHARMAP', ...characters, 'END CHARMAP', ''].join('\n'));
  // Categories other than the numeric one are absent; -c writes the locale anyway.
  await mkdir(locales, { recursive: true });
  const compiled = await runStep('comma locale: compiling', 'localedef',
    ['-c', '--no-warnings=ascii', '-i', source, '-f', charmap, path.join(locales, 'crudui-comma')], { signal });
  await access(path.join(locales, 'crudui-comma', 'LC_NUMERIC'))
    .catch(() => assert.fail(`localedef wrote no locale:\n${compiled.stderr}${compiled.stdout}`));
  return { ...process.env, CRUDUI_COMMA_LOCALE: '1', LOCPATH: locales, LC_ALL: 'crudui-comma' };
}

/* Compile and run a fixture program under a comma decimal locale. */
export async function runUnderCommaLocale({ signal, root, prefix, name, source, sources }) {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    const runEnvironment = await commaLocaleEnvironment(directory, signal);
    await compileAndRunEngineFixture({ signal, root, directory, source, sources, name, runEnvironment });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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
  assert.equal(fixtures.length, 104,
    'Review C template coverage when the shared fixture inventory changes');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-compile-'));
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForFixtures(), name: 'compile-fixtures',
      sources: ['value.c', 'number_text.c', 'engine_error.c', 'compose.c', 'declaration.c', 'template.c'],
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
      sources: ['value.c', 'number_text.c', 'engine_error.c', 'compose.c'],
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
      sources: ['value.c', 'number_text.c', 'engine_error.c', 'compose.c'],
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
    if (fixture.error) {
      // The engine reports no message: a rejected expression is one that does not parse.
      lines.push('  {', `  /* ${fixture.name} */`, '  int ok = 1;');
      const data = builder.emit({});
      lines.push('  bool parsed_value = true, parsed_truth = true;');
      lines.push(`  ps_value *actual = ps_expression_value(${cText(fixture.expr)}, ${data}, NULL, 0, &parsed_value);`);
      lines.push(`  ps_expression_truth(${cText(fixture.expr)}, ${data}, NULL, 0, &parsed_truth);`);
      lines.push('  if (parsed_value || parsed_truth || actual) {');
      lines.push(`    ok = 0; print_text("expression parsed: ", ${cText(fixture.name)});`);
      lines.push('  }');
      lines.push(`  ps_value_free(actual); ps_value_free(${data});`);
      lines.push(...caseReport(fixtureIndex + 1));
      lines.push('  }');
      continue;
    }
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
  assert.equal(fixtures.length, 49,
    'Review C expression coverage when the shared fixture inventory changes');
  assert.equal(fixtures.reduce((total, fixture) => total + (fixture.cases?.length ?? 0), 0), 85,
    'Review C expression coverage when the shared fixture cases change');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-expression-'));
  let output = '';
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForFixtures(), name: 'expression-fixtures',
      sources: ['value.c', 'number_text.c', 'value_path.c', 'expression.c'],
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

/* The engine units of rule evaluation, shared by the validation programs. */
const ruleSources = [
  'whitespace.c', 'canonical.c', 'rule_length.c', 'rule_in.c', 'rule_number.c', 'unicode_data.c',
  'pattern_set.c', 'pattern.c', 'pattern_match.c', 'rule_parameters.c',
];

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
  lines.push(...caseProgramEnd);
  return fixtureProgram(lines);
}

test('PHP extension engine validates all shared form, list and detail cases', { timeout: ENGINE_TEST_BUDGET }, async t => {
  assert.equal(validationCases.length, 265,
    'Review extension validation coverage when the shared validation cases change');
  assert.equal(validationCases.length + specCases.length + listCases.length + detailCases.length, 318,
    'Review extension validation coverage when the shared fixture inventory changes');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-extension-validation-'));
  let output = '';
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForValidation(), name: 'validation',
      sources: [
        'value.c', 'number_text.c', 'value_path.c', 'engine_error.c', 'compose.c', 'expression.c',
        'runtime.c', ...ruleSources, 'validation.c',
      ],
      onOutput: stdout => { output = stdout; },
    });
  } finally {
    recordCases(validationEvidence, output);
    await rm(directory, { recursive: true, force: true });
  }
});

/*
 * A filtered unique rule over rows: the filter runs once per row and the rows are compared by
 * sorting, so four times the rows take about four times as long, not sixteen times.
 */
function sourceForUniqueTime() {
  const builder = new EngineFixtureSource();
  const { lines } = builder;
  const spec = builder.emit({
    type: 'group',
    properties: {
      checked: { type: 'number' },
      rows: {
        type: 'group', multiple: true, validate: { unique: 'checked == 1' },
        properties: { name: { type: 'text' }, enabled: { type: 'number' } },
      },
    },
  });
  lines.push(
    `  double small = unique_time(${spec}, 400), large = unique_time(${spec}, 1600);`,
    '  printf("400 rows: %.4fs, 1600 rows: %.4fs\\n", small, large);',
    `  ps_value_free(${spec});`,
    '  if (small < 0 || large < 0) return 1;',
    '  if (!(large < small * 8)) { fputs("unique time grows faster than the rows\\n", stderr); return 2; }',
  );
  return fixtureProgram(lines, [
    '#include <time.h>',
    'static double seconds(void)',
    '{ struct timespec now; timespec_get(&now, TIME_UTC); return (double)now.tv_sec + (double)now.tv_nsec / 1e9; }',
    '/* The shortest of three validations of distinct checked keyed rows, or -1 when one is not valid. */',
    'static double unique_time(const ps_value *spec, size_t count)',
    '{',
    '  ps_value *rows = ps_object_value(), *data = ps_object_value(), *options = ps_object_value();',
    '  for (size_t i = 0; i < count; ++i) {',
    '    char name[32]; snprintf(name, sizeof(name), "row%zu", i);',
    '    ps_value *row = ps_object_value();',
    '    put(row, PS_TEXT("name"), ps_string_value(name)); put(row, PS_TEXT("enabled"), ps_int_value(1));',
    '    put(rows, ps_fixed(name), row);',
    '  }',
    '  put(data, PS_TEXT("checked"), ps_int_value(1)); put(data, PS_TEXT("rows"), rows);',
    '  double best = -1;',
    '  for (int run = 0; run < 3; ++run) {',
    '    double started = seconds();',
    '    ps_result result = ps_validate(spec, data, options);',
    '    double elapsed = seconds() - started;',
    '    bool valid = result.value && !result.error && ps_get(result.value, "valid") &&',
    '      ps_get(result.value, "valid")->kind == PS_BOOL && ps_get(result.value, "valid")->data.boolean;',
    '    ps_value_free(result.value); ps_value_free(result.error);',
    '    if (!valid) { best = -1; break; }',
    '    if (best < 0 || elapsed < best) best = elapsed;',
    '  }',
    '  ps_value_free(data); ps_value_free(options);',
    '  return best;',
    '}',
  ]);
}

test('PHP extension engine unique rule takes time linear in the rows', { timeout: ENGINE_TEST_BUDGET }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-extension-unique-'));
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForUniqueTime(), name: 'unique-time',
      sources: [
        'value.c', 'number_text.c', 'value_path.c', 'engine_error.c', 'compose.c', 'expression.c',
        'runtime.c', ...ruleSources, 'validation.c',
      ],
      onOutput: stdout => process.stderr.write(`    ${stdout}`),
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function sourceForUniqueRowTime() {
  const builder = new EngineFixtureSource();
  const { lines } = builder;
  const spec = builder.emit({
    type: 'group',
    properties: {
      rows: {
        type: 'group', multiple: true,
        properties: { code: { type: 'text', validate: { unique: true } } },
      },
    },
  });
  lines.push(
    `  double small = unique_time(${spec}, 1500), large = unique_time(${spec}, 6000);`,
    '  printf("1500 rows: %.4fs, 6000 rows: %.4fs\\n", small, large);',
    `  ps_value_free(${spec});`,
    '  if (small < 0 || large < 0) return 1;',
    '  if (!(large < small * 8)) { fputs("unique time grows faster than the rows\\n", stderr); return 2; }',
  );
  return fixtureProgram(lines, [
    '#include <time.h>',
    'static double seconds(void)',
    '{ struct timespec now; timespec_get(&now, TIME_UTC); return (double)now.tv_sec + (double)now.tv_nsec / 1e9; }',
    '/* The shortest of three validations of keyed rows with distinct codes, or -1 when one is not valid. */',
    'static double unique_time(const ps_value *spec, size_t count)',
    '{',
    '  ps_value *rows = ps_object_value(), *data = ps_object_value(), *options = ps_object_value();',
    '  for (size_t i = 0; i < count; ++i) {',
    '    char name[32]; snprintf(name, sizeof(name), "row%zu", i);',
    '    ps_value *row = ps_object_value();',
    '    put(row, PS_TEXT("code"), ps_string_value(name));',
    '    put(rows, ps_fixed(name), row);',
    '  }',
    '  put(data, PS_TEXT("rows"), rows);',
    '  double best = -1;',
    '  for (int run = 0; run < 3; ++run) {',
    '    double started = seconds();',
    '    ps_result result = ps_validate(spec, data, options);',
    '    double elapsed = seconds() - started;',
    '    bool valid = result.value && !result.error && ps_get(result.value, "valid") &&',
    '      ps_get(result.value, "valid")->kind == PS_BOOL && ps_get(result.value, "valid")->data.boolean;',
    '    ps_value_free(result.value); ps_value_free(result.error);',
    '    if (!valid) { best = -1; break; }',
    '    if (best < 0 || elapsed < best) best = elapsed;',
    '  }',
    '  ps_value_free(data); ps_value_free(options);',
    '  return best;',
    '}',
  ]);
}

test('PHP extension engine unique rule on a field in rows takes time linear in the rows', { timeout: ENGINE_TEST_BUDGET }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-extension-unique-row-'));
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForUniqueRowTime(), name: 'unique-row-time',
      sources: [
        'value.c', 'number_text.c', 'value_path.c', 'engine_error.c', 'compose.c', 'expression.c',
        'runtime.c', ...ruleSources, 'validation.c',
      ],
      onOutput: stdout => process.stderr.write(`    ${stdout}`),
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('PHP extension engine validation does not depend on a comma decimal locale', { timeout: ENGINE_TEST_BUDGET }, async t => {
  await runUnderCommaLocale({
    signal: t.signal, root, prefix: 'crudui-extension-validation-locale-', name: 'validation-locale',
    source: sourceForValidation(),
    sources: [
      'value.c', 'number_text.c', 'value_path.c', 'engine_error.c', 'compose.c', 'expression.c',
      'runtime.c', ...ruleSources, 'validation.c',
    ],
  });
});

test('PHP extension engine validation has no undefined behavior findings', { timeout: ENGINE_SANITIZER_BUDGET }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-extension-validation-sanitize-'));
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForValidation(), name: 'validation-sanitize',
      sources: [
        'value.c', 'number_text.c', 'value_path.c', 'engine_error.c', 'compose.c', 'expression.c',
        'runtime.c', ...ruleSources, 'validation.c',
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
        'value.c', 'number_text.c', 'value_path.c', 'engine_error.c', 'compose.c', 'expression.c',
        'runtime.c', ...ruleSources, 'validation.c',
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
  const uniqueRowsProperties = builder.emit({
    rows: {
      type: 'group',
      multiple: true,
      properties: { code: { type: 'text', validate: { unique: true } } },
    },
  });
  const uniqueRowsData = builder.emit({ rows: { first: { code: 'a' }, second: { code: 'a' } } });
  builder.lines.push(
    `  int status = verify_validation_allocation_failures(${repeatedGroupProperties}, ${repeatedGroupData}, 5);`,
    '  if (status) return status;',
    `  status = verify_validation_allocation_failures(${repeatedFieldProperties}, ${repeatedFieldData}, 4);`,
    '  if (status) return 10 + status;',
    `  status = verify_validation_allocation_failures(${uniqueRowsProperties}, ${uniqueRowsData}, 13);`,
    '  if (status) return 20 + status;',
    `  ps_value_free(${uniqueRowsProperties}); ps_value_free(${uniqueRowsData});`,
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
    '    validation_context context = {data, ps_array_value(), NULL, NULL, 0, NULL, NULL, 0, ps_object_value()};',
    '    if (!context.errors || !context.unique_positions) return 1;',
    '    validation_allocation_index = 0;',
    '    validation_fail_at = fail_at;',
    '    validation_allocation_failed = false;',
    '    bool result = validate_properties(properties, data, &context, NULL, 0, 0, false);',
    '    validation_fail_at = 0;',
    '    ps_value_free(context.errors);',
    '    free(context.declaration);',
    '    release_unique_rows(&context);',
    '    if (!validation_allocation_failed) return 2;',
    '    if (result) return 3;',
    '  }',
    '  validation_context context = {data, ps_array_value(), NULL, NULL, 0, NULL, NULL, 0, ps_object_value()};',
    '  if (!context.errors || !context.unique_positions) return 4;',
    '  validation_allocation_index = 0;',
    '  validation_fail_at = allocation_count + 1;',
    '  validation_allocation_failed = false;',
    '  bool result = validate_properties(properties, data, &context, NULL, 0, 0, false);',
    '  validation_fail_at = 0;',
    '  ps_value_free(context.errors);',
    '  free(context.declaration);',
    '  release_unique_rows(&context);',
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
        'value.c', 'number_text.c', 'value_path.c', 'engine_error.c', 'compose.c', 'expression.c',
        'runtime.c', ...ruleSources,
      ],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
}

{
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { contractPath, outputPath, unicodeDataSource } = await import('../tools/generate-unicode-data.mjs');
const unicode = JSON.parse(await readFile(contractPath, 'utf8'));

test('PHP extension Unicode data is generated from the contract', { timeout: ENGINE_INSPECTION_BUDGET }, async () => {
  assert.equal(unicode.format, 'crudui/unicode-properties');
  assert.equal(await readFile(outputPath, 'utf8'), unicodeDataSource(unicode),
    'Regenerate with: node packages/php-ext/tools/generate-unicode-data.mjs');
});

/* A deterministic sequence of 64-bit patterns (xorshift64*). */
function* bitPatterns(seed, count) {
  let state = seed;
  const mask = (1n << 64n) - 1n;
  for (let index = 0; index < count; index += 1) {
    state ^= state >> 12n;
    state ^= (state << 25n) & mask;
    state ^= state >> 27n;
    yield (state * 0x2545F4914F6CDD1Dn) & mask;
  }
}

function doubleOfBits(bits) {
  const view = new DataView(new ArrayBuffer(8));
  view.setBigUint64(0, bits);
  return view.getFloat64(0);
}

function bitsOfDouble(number) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, number);
  return view.getBigUint64(0);
}

/*
 * Doubles whose canonical text is compared with Number.prototype.toString: edge values, powers of
 * two over the whole range with their largest mantissa, powers of ten with several digit strings,
 * neighbours of short decimals and random bit patterns of every exponent.
 */
function canonicalNumbers() {
  const values = new Set([
    0, -0, 1, -1, 0.1, 0.2, 0.1 + 0.2, 1.5, 12, 123456789012345680000, 1e21, 1e-7, 0.000001,
    1e-6, 9.999999999999999e20, 1.0000000000000001e21, 5e-324, -5e-324, 1e-323,
    Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE, 2.2250738585072014e-308,
    2.225073858507201e-308, Number.EPSILON, Number.MAX_SAFE_INTEGER, 2 ** 53, 2 ** 53 + 2,
    1 / 3, 2 / 3, Math.PI, Math.E, 100, 1e100, 123e-20, 5e-7, 4.35, 0.3,
    9.5e-5, 1234.5678, 0.00001234, 8.41e21, 5e22, 1e23, 2 ** 70, 2 ** 69 + 2 ** 17,
  ]);
  for (let exponent = -1074; exponent <= 1023; exponent += 1) {
    values.add(2 ** exponent);
    values.add(2 ** exponent * (2 - 2 ** -52));
  }
  for (let exponent = -324; exponent <= 308; exponent += 1) {
    for (const digits of ['1', '1.5', '2', '5', '9.999999999999999', '1.2345678901234567'])
      values.add(Number(`${digits}e${exponent}`));
  }
  for (const text of ['0.1', '0.3', '1.1', '2.675', '100.5', '1e22', '123456.789']) {
    const bits = bitsOfDouble(Number(text));
    for (const step of [-2n, -1n, 1n, 2n]) values.add(doubleOfBits(bits + step));
  }
  for (const bits of bitPatterns(0x9E3779B97F4A7C15n, 20000)) values.add(doubleOfBits(bits));
  return [...values].filter(Number.isFinite);
}

/* Numeric text: the HTML valid floating-point number whose value (the nearest double) is finite. */
const NUMERIC_TEXT = /^-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?$/;
function numericTexts() {
  const texts = new Set([
    '', '-', '.', '1.', '+1', '.5', '-.5', '0', '-0', '00012', '1e', 'e5', '1e+', '1E-3', '--1', '0x10', 'Infinity',
    'NaN', '1_000', '1,5', '1 2', '\u0661', '1e999', '-1e999', '1e-400', '-1e-400', '1e308', '1.7976931348623157e308',
    '1.7976931348623158e308', '1.7976931348623159e308', '179769313486231580793728971405301e276',
    '2.2250738585072011e-308', '2.2250738585072014e-308', '4.9406564584124654e-324', '2.4703282292062327e-324',
    '2.4703282292062328e-324', '7.4109846876186982e-324', '1e-324', '3e-324', '0.1', '0.3', '1e23', '8.41e21',
    '9007199254740993', '9007199254740992.5', '1e0000000000000000000000000005', '1e-0000000000000000000000000400',
    `0.${'0'.repeat(400)}1e400`, `1${'0'.repeat(400)}e-400`, `${'9'.repeat(900)}e-900`, `0.${'1'.repeat(1000)}`,
    `4.${'9'.repeat(799)}e-324`, `2.4703282292062327208828439643411068618252990130716238221279284125033775363510437593264991818081799618989828234772285886546332835517796989819938739800539093906315035659515570226392290858392449105184435931802849936536152500319370457678249219365623669863658480757001585769269903706311928279558551332927834338409351978015531246597263579574622766465272827220056374006485499977096599470454020828166226237857393450736339007967761930577506740176324673600968951340535537458516661134223766678604162159680461914467291840300530057530849048765391711386591646239524912623653881879636239373280423891018672348497668235089863388587925628302755995657524455507255189313690836254779186948667994968324049705821028513185451396213837722826145437693412532098591327667236328125e-324`,
    `2.4703282292062327208828439643411068618252990130716238221279284125033775363510437593264991818081799618989828234772285886546332835517796989819938739800539093906315035659515570226392290858392449105184435931802849936536152500319370457678249219365623669863658480757001585769269903706311928279558551332927834338409351978015531246597263579574622766465272827220056374006485499977096599470454020828166226237857393450736339007967761930577506740176324673600968951340535537458516661134223766678604162159680461914467291840300530057530849048765391711386591646239524912623653881879636239373280423891018672348497668235089863388587925628302755995657524455507255189313690836254779186948667994968324049705821028513185451396213837722826145437693412532098591327667236328125001e-324`,
  ]);
  for (const number of canonicalNumbers().filter((_, index) => index % 7 === 0)) {
    texts.add(String(number));
    texts.add(number.toExponential());
    texts.add(number.toPrecision(21).replace('+', ''));
  }
  for (const bits of bitPatterns(0x243F6A8885A308D3n, 3000)) {
    const number = doubleOfBits(bits);
    if (!Number.isFinite(number)) continue;
    texts.add(number.toPrecision(17));
    texts.add(number.toExponential(25));
  }
  return [...texts].map(text => {
    const number = Number(text);
    return [text, NUMERIC_TEXT.test(text) && Number.isFinite(number), number];
  });
}

/* Texts in the C number syntax beyond numeric text: signs, spaces, prefixes, words and hexadecimal. */
const cNumberTexts = [
  '  +1.5e3xyz', '\t-0.25e-2,5', '1.', '1.e5', '.e1', '1e+', '1ex', '+', '-.', '0x', '0x1p', '0x1.8p1', '0X.8P-2',
  '0x1fffffffffffffp971', '0x1p1024', '-0x1p-1074', '0x1p-1080', '0x123456789abcdef0123p-60', '0xg', 'inf', '-INF',
  'Infinity', 'infinit', 'nan', 'NaN(123abc)', 'nan(', 'nanx', '1e999', '-1e999', '1e-999', '  12abc', '1,5',
  '\u00a01', '٣', '0.000000000000000000000000000000000000001e-300',
];

/* Step multiples decided on the exact decimal numbers of the canonical texts. */
function decimalOf(number) {
  const [mantissa, power = '0'] = String(Math.abs(number)).split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  return [BigInt(whole + fraction), Number(power) - fraction.length];
}
function stepMultiple(value, step) {
  const [a, p] = decimalOf(value);
  const [b, q] = decimalOf(step);
  const base = Math.min(p, q);
  return (a * 10n ** BigInt(p - base)) % (b * 10n ** BigInt(q - base)) === 0n;
}
function stepCases() {
  const cases = [[0.3, 0.1], [0.30000000000000004, 0.1], [2e-7, 0.1], [-0.6, 0.1], [0, 0.1], [1e21, 1e20],
    [1.05e21, 1e20], [1.5e21, 1e20], [3e-7, 2e-7], [4e-7, 2e-7], [1.75, 0.25], [1.8, 0.25], [5e-324, 5e-324],
    [1e-323, 5e-324], [Number.MAX_VALUE, 1e-300], [Number.MAX_VALUE, 7], [1e308, 3e-5], [123456789012345680000, 17],
    [0.000001, 1e-7], [9007199254740992, 3], [12, 1e-320], [1e-7, 1e21]];
  const numbers = canonicalNumbers().filter((_, index) => index % 97 === 0);
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    cases.push([numbers[i], Math.abs(numbers[i + 1]) || 1]);
    cases.push([numbers[i] * 3, Math.abs(numbers[i]) || 1]);
  }
  return cases.filter(([value, step]) => Number.isFinite(value) && Number.isFinite(step) && step > 0)
    .map(([value, step]) => [value, step, stepMultiple(value, step)]);
}

/* Integers are written as their nearest double. */
const canonicalIntegers = [
  0n, 7n, -7n, 9007199254740991n, 9007199254740993n, -9007199254740993n, 123456789012345678n,
  9223372036854775807n, -9223372036854775808n, 1000000000000000000n,
];

/* Patterns outside the language with their reason and offset, and patterns inside it. */
const rejectedPatterns = [
  ['', 'empty pattern', 0],
  ['한(', 'unterminated group', 2],
  ['(a$', 'unterminated group', 3],
  ['[', 'unterminated class', 1],
  ['[a', 'unterminated class', 2],
  ['[a-', 'unterminated class', 3],
  ['(((', 'unterminated group', 3],
  ['(?', 'unsupported construct', 0],
  ['(?<!a)', 'unsupported construct', 0],
  ['(?<=a)', 'unsupported construct', 0],
  ['(?P<a>x)', 'unsupported construct', 0],
  ['(?<', 'invalid group name', 0],
  ['(?<a', 'invalid group name', 0],
  ['(?<a-b>x)', 'invalid group name', 0],
  ['(?<1>x)', 'invalid group name', 0],
  ['(?<n>a)(?<n>b)', 'duplicate group name', 7],
  ['a}', 'unexpected character', 1],
  ['a$b', 'unexpected character', 1],
  ['(a$)', 'unexpected character', 2],
  ['^^', 'unexpected character', 1],
  ['a)', 'unexpected character', 1],
  ['^*', 'invalid quantifier', 1],
  ['a|*', 'invalid quantifier', 2],
  ['a*??', 'invalid quantifier', 3],
  ['a**', 'invalid quantifier', 2],
  ['a{2}{3}', 'invalid quantifier', 4],
  ['a{1,1001}', 'invalid quantifier', 1],
  ['a{1001,}', 'invalid quantifier', 1],
  ['a{3,2}', 'invalid quantifier', 1],
  ['a{,2}', 'invalid quantifier', 1],
  ['a{99999999999999999999}', 'invalid quantifier', 1],
  ['a{x}', 'invalid quantifier', 1],
  ['\\', 'invalid escape', 0],
  ['ab\\', 'invalid escape', 2],
  [String.raw`\u{}`, 'invalid escape', 0],
  [String.raw`\u{0000041}`, 'invalid escape', 0],
  [String.raw`\u{DFFF}`, 'invalid escape', 0],
  [String.raw`\u{110000}`, 'invalid escape', 0],
  ['\\' + 'u0041', 'invalid escape', 0],
  [String.raw`\x4`, 'invalid escape', 0],
  [String.raw`\cA`, 'invalid escape', 0],
  [String.raw`\0`, 'invalid escape', 0],
  [String.raw`\b`, 'invalid escape', 0],
  [String.raw`[a\q]`, 'invalid escape', 2],
  [String.raw`\p{Cs}`, 'invalid property', 0],
  [String.raw`\p{Cn}`, 'invalid property', 0],
  [String.raw`\p{Lu`, 'invalid property', 0],
  [String.raw`\p{lu}`, 'invalid property', 0],
  [String.raw`\pL`, 'invalid property', 0],
  [String.raw`\p{sc=Latin}`, 'invalid property', 0],
  [String.raw`\p{Script=latin}`, 'invalid property', 0],
  [String.raw`\P{Script=Klingon}`, 'invalid property', 0],
  [String.raw`\p{Script_Extensions=Latin}`, 'invalid property', 0],
  ['[^]', 'invalid class', 0],
  ['a[]', 'invalid class', 1],
  [String.raw`[\W]`, 'invalid class', 0],
  [String.raw`[a-\D]`, 'invalid class', 0],
  [String.raw`[\d-\D]`, 'invalid class', 0],
  ['[a[]', 'invalid class', 0],
  ['[a-b-c]', 'invalid class', 0],
  [String.raw`[\d-\q]`, 'invalid escape', 4],
  [String.raw`[\p{L}-z]`, 'invalid range', 1],
  [String.raw`[a-\d]`, 'invalid range', 1],
  ['[a--]', 'invalid range', 1],
  ['x[b-a]', 'invalid range', 2],
  ['a{1001}', 'invalid quantifier', 1],
  ['(a{600}){2,}', 'pattern too large', 0],
  ['a{1000,}', 'pattern too large', 0],
  ['(a+){501}', 'pattern too large', 0],
  ['((a{10}){10}){11}', 'pattern too large', 0],
  ['a'.repeat(1001), 'pattern too large', 0],
  ['(a{1000}){1000}[', 'unterminated class', 16],
  ['(a{1000}){1000}(?', 'unsupported construct', 15],
  ['('.repeat(101) + ')'.repeat(101), 'nesting too deep', 100],
  ['()'.repeat(10) + '('.repeat(101), 'nesting too deep', 120],
];

const acceptedPatterns = [
  '^', '$', '^$', 'a|', '|', '()', '(a{1000}){0}', 'a{0001}', '(a){2}', '[-a]', '[a-]', '[!--]',
  '[.$^*a-a|]', String.raw`\u{10FFFF}`, String.raw`\P{Script=Latin}`, '\u{1F600}', 'a{1000}',
  '(?:a*){500}', 'a{999,}', '(a+){500}', '('.repeat(100) + ')'.repeat(100), '((){1000}){1000}',
  'a'.repeat(1000), String.raw`\p{C}\p{Co}\p{Cf}\p{Cc}`, '/x/i',
];

/* Whole-value matches: pattern, text and whether it matches. */
const matchCases = [
  ['a|b', 'a', true], ['a|b', 'ab', false], ['a|', '', true], ['a|', 'a', true],
  ['^ab$', 'ab', true], ['^$', '', true], ['^$', 'x', false], ['x', 'x\n', false],
  ['a{2,3}', 'a', false], ['a{2,3}', 'aa', true], ['a{2,3}', 'aaa', true], ['a{2,3}', 'aaaa', false],
  ['a{2,3}?', 'aaa', true], ['a{0002}', 'aa', true], ['a{2,}', 'a'.repeat(5000), true],
  ['(ab|c)+d?', 'abcab', true], ['(ab|c)+d?', 'abcabd', true], ['(ab|c)+d?', 'd', false],
  ['(a?)*b', 'aaab', true], ['(|a)+', 'aaa', true], ['()*', '', true], ['()*', 'a', false],
  ['(a{1000}){0}', '', true], ['(a{1000}){0}', 'a', false], ['((){1000}){1000}', '', true],
  ['a.b', 'a\u{1F600}b', true], ['a.b', 'a\nb', false], ['a.b', 'a\u0000b', true],
  ['[.$^*a-a|]+', '.$^*a|', true], ['[.$^*a-a|]', 'b', false],
  ['[^a-c]', 'd', true], ['[^a-c]', 'b', false], ['[^a-c]', '\u{10FFFF}', true],
  [String.raw`\d\w`, '1_', true], [String.raw`\d`, '١', false],
  [String.raw`\s`, '　', true], [String.raw`\s`, '᠎', false], [String.raw`\S`, '᠎', true],
  [String.raw`\S`, '　', false], [String.raw`[\s\d]+`, ' 1 ', true],
  [String.raw`\p{Lu}\P{Lu}`, 'Aa', true], [String.raw`\p{Lu}`, 'a', false],
  [String.raw`\p{Script=Hangul}+`, '한글', true], [String.raw`\P{Script=Latin}+`, '1x', false],
  [String.raw`\p{Script=Garay}`, '\u{10D40}', true], [String.raw`\p{C}`, '\u{E0000}', true],
  [String.raw`\p{C}`, '͸', true], [String.raw`\p{Co}`, '', true], [String.raw`\P{C}`, 'a', true],
  [String.raw`\u{0}\x41\t`, '\u0000A\t', true], ['/x/i', '/x/i', true], ['/x/i', 'x', false],
  ['(?<name>a)(?:b)', 'ab', true], ['[-a]+', '-a-', true], ['[!--]+', '!,-', true],
  ['(?:[^\\n]*a){12}c', 'a'.repeat(100000), false], ['(x+x+)+y', 'x'.repeat(100000), false],
  [String.raw`\p{L}{1000}`, '한'.repeat(1000), true], [String.raw`\p{L}{1000}`, '한'.repeat(999), false],
  ['(a|aa)*(b|c)', 'a'.repeat(100000) + 'd', false], ['(a|aa)*(b|c)', 'a'.repeat(100000) + 'c', true],
];

function sourceForValues() {
  const rangeList = ranges => `{${ranges.map(([start, end]) => `{0x${start.toString(16)}, 0x${end.toString(16)}}`).join(', ')}}`;
  const propertyRows = table => Object.entries(table).map(([name, ranges]) =>
    `  {${cString(name)}, (const ps_code_range[])${rangeList(ranges)}, ${ranges.length}},`);
  const declarations = [
    '/* The contract, independent of the generated source. */',
    `static const ps_code_range contract_white_space[] = ${rangeList(unicode.whiteSpace)};`,
    'static const ps_unicode_property contract_categories[] = {',
    ...propertyRows(unicode.generalCategories),
    '};',
    'static const ps_unicode_property contract_scripts[] = {',
    ...propertyRows(unicode.scripts),
    '};',
    '',
    'static bool same_ranges(const ps_code_range *left, size_t left_count, const ps_code_range *right, size_t right_count)',
    '{',
    '  if (left_count != right_count) return false;',
    '  for (size_t i = 0; i < left_count; ++i)',
    '    if (left[i].start != right[i].start || left[i].end != right[i].end) return false;',
    '  return true;',
    '}',
    '',
    'typedef struct { uint64_t bits; const char *text; size_t length; } number_case;',
    'static const number_case number_cases[] = {',
    ...canonicalNumbers().map(number => {
      const text = String(number);
      return `  {UINT64_C(0x${bitsOfDouble(number).toString(16)}), ${cString(text)}, ${text.length}},`;
    }),
    '};',
    'typedef struct { ps_text text; bool numeric; uint64_t bits; } numeric_case;',
    'static const numeric_case numeric_cases[] = {',
    ...numericTexts().map(([text, numeric, number]) =>
      `  {${cTextInitializer(text)}, ${numeric}, UINT64_C(0x${numeric ? bitsOfDouble(number).toString(16) : '0'})},`),
    '};',
    'static const ps_text syntax_cases[] = {',
    ...[...numericTexts().map(([text]) => text), ...cNumberTexts].map(text => `  ${cTextInitializer(text)},`),
    '};',
    'typedef struct { uint64_t value, step; bool multiple; } step_case;',
    'static const step_case step_cases[] = {',
    ...stepCases().map(([value, step, multiple]) =>
      `  {UINT64_C(0x${bitsOfDouble(value).toString(16)}), UINT64_C(0x${bitsOfDouble(step).toString(16)}), ${multiple}},`),
    '};',
    'typedef struct { int64_t integer; const char *text; } integer_case;',
    'static const integer_case integer_cases[] = {',
    ...canonicalIntegers.map(integer => `  {${integer === -9223372036854775808n ? 'INT64_MIN' : `INT64_C(${integer})`}, ${cString(String(Number(integer)))}},`),
    '};',
    '',
    'typedef struct { ps_text source; const char *reason; size_t offset; } rejected_case;',
    'static const rejected_case rejected_cases[] = {',
    ...rejectedPatterns.map(([source, reason, offset]) => `  {${cTextInitializer(source)}, ${cString(reason)}, ${offset}},`),
    '};',
    'static const ps_text accepted_cases[] = {',
    ...acceptedPatterns.map(source => `  ${cTextInitializer(source)},`),
    '};',
    'typedef struct { ps_text source; ps_text text; bool matches; } match_case;',
    'static const match_case match_cases[] = {',
    ...matchCases.map(([source, text, matches]) => `  {${cTextInitializer(source)}, ${cTextInitializer(text)}, ${matches}},`),
    '};',
    '',
    '#include <errno.h>',
    '#include <math.h>',
    'static int failures;',
    'static void failure(const char *label, ps_text text)',
    '{ fputs(label, stderr); fwrite(text.bytes, 1, text.length > 200 ? 200 : text.length, stderr); fputc(10, stderr); failures++; }',
    '',
  ];
  const lines = [
    '  /*',
    '   * The C library is the reference for the C number syntax and for "%.*g", read in the "C"',
    '   * locale before the program switches to the locale under test.',
    '   */',
    '  setlocale(LC_ALL, "C");',
    '  static const int precisions[] = {1, 2, 6, 15, 17};',
    '  size_t number_count = sizeof(number_cases) / sizeof(number_cases[0]);',
    '  char (*general_references)[5][32] = malloc(number_count * sizeof(*general_references));',
    '  if (!general_references) return 1;',
    '  for (size_t i = 0; i < number_count; ++i) {',
    '    double number;',
    '    memcpy(&number, &number_cases[i].bits, sizeof(number));',
    '    for (size_t p = 0; p < 5; ++p) snprintf(general_references[i][p], 32, "%.*g", precisions[p], number);',
    '  }',
    '  size_t syntax_count = sizeof(syntax_cases) / sizeof(syntax_cases[0]);',
    '  typedef struct { size_t length; double number; bool overflow; } syntax_reference;',
    '  syntax_reference *syntax_references = malloc(syntax_count * sizeof(*syntax_references));',
    '  if (!syntax_references) return 1;',
    '  for (size_t i = 0; i < syntax_count; ++i) {',
    '    char *end = NULL;',
    '    errno = 0;',
    '    syntax_references[i].number = strtod(syntax_cases[i].bytes, &end);',
    '    syntax_references[i].length = (size_t)(end - syntax_cases[i].bytes);',
    '    syntax_references[i].overflow = errno == ERANGE && isinf(syntax_references[i].number);',
    '  }',
    '  crudui_locale_start();',
    '',
    '  /* The embedded Unicode data is the contract. */',
    `  if (strcmp(ps_unicode_version, ${cString(unicode.unicodeVersion)})) failure("Unicode version differs", PS_TEXT(""));`,
    '  if (!same_ranges(ps_white_space, ps_white_space_count, contract_white_space, sizeof(contract_white_space) / sizeof(contract_white_space[0])))',
    '    failure("White_Space differs from the contract", PS_TEXT(""));',
    `  if (ps_general_categories_count != ${Object.keys(unicode.generalCategories).length} || ps_scripts_count != ${Object.keys(unicode.scripts).length})`,
    '    failure("property count differs from the contract", PS_TEXT(""));',
    '  for (size_t i = 0; i < sizeof(contract_categories) / sizeof(contract_categories[0]); ++i) {',
    '    const ps_unicode_property *found = ps_unicode_category(ps_fixed(contract_categories[i].name));',
    '    if (!found || !same_ranges(found->ranges, found->count, contract_categories[i].ranges, contract_categories[i].count))',
    '      failure("category differs from the contract: ", ps_fixed(contract_categories[i].name));',
    '  }',
    '  for (size_t i = 0; i < sizeof(contract_scripts) / sizeof(contract_scripts[0]); ++i) {',
    '    const ps_unicode_property *found = ps_unicode_script(ps_fixed(contract_scripts[i].name));',
    '    if (!found || !same_ranges(found->ranges, found->count, contract_scripts[i].ranges, contract_scripts[i].count))',
    '      failure("script differs from the contract: ", ps_fixed(contract_scripts[i].name));',
    '  }',
    '  if (ps_unicode_category(PS_TEXT("Cs")) || ps_unicode_category(PS_TEXT("Cn")) || ps_unicode_script(PS_TEXT("Klingon")))',
    '    failure("a property outside the data was found", PS_TEXT(""));',
    '',
    '  /* Whitespace is the White_Space table over every code point. */',
    '  for (uint32_t code = 0; code <= 0x10ffff; ++code) {',
    '    bool expected = false;',
    '    for (size_t i = 0; i < sizeof(contract_white_space) / sizeof(contract_white_space[0]); ++i)',
    '      expected = expected || (code >= contract_white_space[i].start && code <= contract_white_space[i].end);',
    '    if (ps_whitespace(code) != expected) {',
    '      char text[16]; snprintf(text, sizeof(text), "%X", (unsigned)code);',
    '      failure("whitespace differs: ", ps_fixed(text));',
    '    }',
    '  }',
    `  if (!ps_text_equal(ps_trim(${cText('　\t x \u0000 y  ')}), ${cText('x \u0000 y')})) failure("trim differs", PS_TEXT(""));`,
    `  if (!ps_text_equal(ps_trim(${cText('﻿x​')}), ${cText('﻿x​')})) failure("trim removed a code point that is not whitespace", PS_TEXT(""));`,
    `  if (ps_trim(${cText('  　')}).length) failure("whitespace is not empty after trimming", PS_TEXT(""));`,
    `  if (ps_code_points(${cText('a\u0000\u{1f468}‍\u{1f469}한')}) != 6) failure("code points differ", PS_TEXT(""));`,
    '',
    '  /* Sets: surrogates belong to C and to every complement, never to a script or letter set. */',
    '  {',
    '    const ps_unicode_property *other = ps_unicode_category(PS_TEXT("C"));',
    '    const ps_unicode_property *letter = ps_unicode_category(PS_TEXT("L"));',
    '    if (!ps_code_ranges_contain(other->ranges, other->count, 0xd800) || !ps_code_ranges_contain(other->ranges, other->count, 0xdfff))',
    '      failure("surrogates are not in C", PS_TEXT(""));',
    '    ps_code_set set = {0};',
    '    ps_code_set_add_ranges(&set, letter->ranges, letter->count);',
    '    ps_code_set_complement(&set);',
    '    if (!ps_code_ranges_contain(set.ranges, set.count, 0xd800) || ps_code_ranges_contain(set.ranges, set.count, 0x41) ||',
    '        !ps_code_ranges_contain(set.ranges, set.count, 0x10ffff) || !ps_code_ranges_contain(set.ranges, set.count, 0))',
    '      failure("complement differs", PS_TEXT(""));',
    '    ps_code_set_complement(&set);',
    '    if (!same_ranges(set.ranges, set.count, letter->ranges, letter->count)) failure("double complement differs", PS_TEXT(""));',
    '    ps_code_set_free(&set);',
    '    ps_code_set_add(&set, 5, 9); ps_code_set_add(&set, 0, 2); ps_code_set_add(&set, 3, 4); ps_code_set_add(&set, 20, 30); ps_code_set_add(&set, 25, 26);',
    '    ps_code_set_normalize(&set);',
    '    if (!same_ranges(set.ranges, set.count, (const ps_code_range[]){{0, 9}, {20, 30}}, 2)) failure("union differs", PS_TEXT(""));',
    '    ps_code_set_complement(&set);',
    '    if (!same_ranges(set.ranges, set.count, (const ps_code_range[]){{10, 19}, {31, 0x10ffff}}, 2)) failure("complement from 0 differs", PS_TEXT(""));',
    '    ps_code_set_free(&set);',
    '    ps_code_set_complement(&set);',
    '    if (!same_ranges(set.ranges, set.count, (const ps_code_range[]){{0, 0x10ffff}}, 1)) failure("complement of nothing differs", PS_TEXT(""));',
    '    ps_code_set_complement(&set);',
    '    if (set.count) failure("complement of everything is not empty", PS_TEXT(""));',
    '    ps_code_set_free(&set);',
    '  }',
    '',
    '  /* Canonical number text is Number.prototype.toString of the double. */',
    '  for (size_t i = 0; i < sizeof(number_cases) / sizeof(number_cases[0]); ++i) {',
    '    double number;',
    '    memcpy(&number, &number_cases[i].bits, sizeof(number));',
    '    ps_chars text = ps_number_text(number);',
    '    ps_text expected = {number_cases[i].text, number_cases[i].length};',
    '    if (!text.bytes || !ps_text_equal(ps_view(text), expected)) {',
    '      failure("number text differs from ", expected);',
    '      if (text.bytes) failure("  actual: ", ps_view(text));',
    '    }',
    '    free(text.bytes);',
    '  }',
    '  for (size_t i = 0; i < sizeof(integer_cases) / sizeof(integer_cases[0]); ++i) {',
    '    ps_value *value = ps_int_value(integer_cases[i].integer);',
    '    ps_chars text;',
    '    if (ps_canonical_text(value, &text) != 1 || !ps_text_equal(ps_view(text), ps_fixed(integer_cases[i].text)))',
    '      failure("integer text differs from ", ps_fixed(integer_cases[i].text));',
    '    free(text.bytes);',
    '    ps_value_free(value);',
    '  }',
    '  {',
    '    ps_value *values[] = {ps_bool_value(true), ps_bool_value(false), ps_float_value(-0.0), ps_float_value(2.5),',
    '      ps_text_value(PS_TEXT(" a ")), ps_null_value(), ps_array_value(), ps_object_value()};',
    '    const char *expected[] = {"1", "0", "0", "2.5", " a ", NULL, NULL, NULL};',
    '    for (size_t i = 0; i < sizeof(values) / sizeof(values[0]); ++i) {',
    '      ps_chars text;',
    '      int scalar = ps_canonical_text(values[i], &text);',
    '      if (expected[i] ? scalar != 1 || !ps_text_equal(ps_view(text), ps_fixed(expected[i])) : scalar != 0)',
    '        failure("canonical text differs: ", ps_fixed(expected[i] ? expected[i] : "(none)"));',
    '      free(text.bytes);',
    '      ps_value_free(values[i]);',
    '    }',
    '  }',
    '',
    '  /* The C number syntax and "%.*g" equal the C library in the "C" locale. */',
    '  for (size_t i = 0; i < syntax_count; ++i) {',
    '    double number = 0;',
    '    bool overflow = false;',
    '    size_t length = ps_c_number(syntax_cases[i], &number, &overflow);',
    '    const syntax_reference *expected = &syntax_references[i];',
    '    bool same = length == expected->length && overflow == expected->overflow &&',
    '      (isnan(expected->number) ? isnan(number) : !memcmp(&number, &expected->number, sizeof(number)));',
    '    if (!same) failure("C number syntax differs: ", syntax_cases[i]);',
    '  }',
    '  for (size_t i = 0; i < number_count; ++i) {',
    '    double number;',
    '    memcpy(&number, &number_cases[i].bits, sizeof(number));',
    '    for (size_t p = 0; p < 5; ++p) {',
    '      ps_chars text = ps_format_general(number, precisions[p]);',
    '      if (!text.bytes || !ps_text_equal(ps_view(text), ps_fixed(general_references[i][p]))) {',
    '        failure("general number text differs from ", ps_fixed(general_references[i][p]));',
    '        if (text.bytes) failure("  actual: ", ps_view(text));',
    '      }',
    '      free(text.bytes);',
    '    }',
    '  }',
    '  free(general_references);',
    '  free(syntax_references);',
    '',
    '  /* Numeric text is read exactly and independently of the locale; step multiples are exact. */',
    '  for (size_t i = 0; i < sizeof(numeric_cases) / sizeof(numeric_cases[0]); ++i) {',
    '    double number = 0;',
    '    bool numeric = ps_numeric_text(numeric_cases[i].text, &number);',
    '    uint64_t bits;',
    '    memcpy(&bits, &number, sizeof(bits));',
    '    if (numeric != numeric_cases[i].numeric || (numeric && bits != numeric_cases[i].bits))',
    '      failure(numeric ? "numeric text differs: " : "numeric text rejected: ", numeric_cases[i].text);',
    '  }',
    '  for (size_t i = 0; i < sizeof(step_cases) / sizeof(step_cases[0]); ++i) {',
    '    double value, step;',
    '    memcpy(&value, &step_cases[i].value, sizeof(value));',
    '    memcpy(&step, &step_cases[i].step, sizeof(step));',
    '    if (ps_step_multiple(value, step) != (step_cases[i].multiple ? 1 : 0)) {',
    '      char detail[96]; snprintf(detail, sizeof(detail), "step multiple differs: %.17g / %.17g", value, step);',
    '      failure(detail, PS_TEXT(""));',
    '    }',
    '  }',
    '',
    '  /* The pattern language. */',
    '  for (size_t i = 0; i < sizeof(rejected_cases) / sizeof(rejected_cases[0]); ++i) {',
    '    const rejected_case *item = &rejected_cases[i];',
    '    ps_pattern *pattern;',
    '    ps_pattern_error error;',
    '    int result = ps_pattern_compile(item->source, &pattern, &error);',
    '    if (result != 0 || strcmp(error.reason, item->reason) || error.offset != item->offset) {',
    '      char detail[96];',
    '      snprintf(detail, sizeof(detail), "pattern result differs (%s at %zu): ", result ? "accepted" : error.reason, error.offset);',
    '      failure(detail, item->source);',
    '    }',
    '    ps_pattern_free(pattern);',
    '  }',
    '  for (size_t i = 0; i < sizeof(accepted_cases) / sizeof(accepted_cases[0]); ++i) {',
    '    ps_pattern *pattern;',
    '    ps_pattern_error error;',
    '    if (ps_pattern_compile(accepted_cases[i], &pattern, &error) != 1) failure("pattern rejected: ", accepted_cases[i]);',
    '    /* Character states never exceed the size, and every other state is bounded by it. */',
    '    else if (ps_pattern_state_count(pattern) > 3 * 1000 + 2) failure("too many states: ", accepted_cases[i]);',
    '    ps_pattern_free(pattern);',
    '  }',
    '  {',
    '    ps_pattern *pattern;',
    '    ps_pattern_error error;',
    '    if (ps_pattern_compile(PS_TEXT("((){1000}){1000}"), &pattern, &error) != 1 || ps_pattern_state_count(pattern) > 4)',
    '      failure("a repetition of size 0 is not one state", PS_TEXT(""));',
    '    ps_pattern_free(pattern);',
    '  }',
    '',
    '  /* The matcher. */',
    '  for (size_t i = 0; i < sizeof(match_cases) / sizeof(match_cases[0]); ++i) {',
    '    const match_case *item = &match_cases[i];',
    '    ps_pattern *pattern;',
    '    ps_pattern_error error;',
    '    if (ps_pattern_compile(item->source, &pattern, &error) != 1) { failure("pattern rejected: ", item->source); continue; }',
    '    int matched = ps_pattern_matches(pattern, item->text);',
    '    if (matched != (item->matches ? 1 : 0)) failure(item->matches ? "no match: " : "unexpected match: ", item->source);',
    '    ps_pattern_free(pattern);',
    '  }',
    '  {',
    '    ps_pattern_cache *cache = ps_pattern_cache_new();',
    '    const ps_pattern *first, *second;',
    '    ps_pattern_error error;',
    '    if (!cache || ps_pattern_cache_get(cache, PS_TEXT("a+"), &first, &error) != 1 ||',
    '        ps_pattern_cache_get(cache, PS_TEXT("a+"), &second, &error) != 1 || first != second ||',
    '        ps_pattern_cache_get(cache, PS_TEXT("a("), &second, &error) != 0 || second || error.offset != 2 ||',
    '        ps_pattern_cache_get(cache, PS_TEXT("a("), &second, &error) != 0 || strcmp(error.reason, "unterminated group"))',
    '      failure("the pattern cache differs", PS_TEXT(""));',
    '    ps_pattern_cache_free(cache);',
    '  }',
    '  if (failures) { fprintf(stderr, "%d failures\\n", failures); return 1; }',
  ];
  return fixtureProgram(lines, declarations, { explicitLocale: true });
}

test('PHP extension engine values and number text do not depend on a comma decimal locale', { timeout: ENGINE_TEST_BUDGET }, async t => {
  await runUnderCommaLocale({
    signal: t.signal, root, prefix: 'crudui-extension-values-locale-', name: 'values-locale', source: sourceForValues(),
    sources: ['value.c', 'number_text.c', 'whitespace.c', 'canonical.c', 'rule_length.c', 'rule_number.c', 'unicode_data.c', 'pattern_set.c', 'pattern.c', 'pattern_match.c'],
  });
});

for (const sanitized of [false, true]) {
  test(`PHP extension engine values, Unicode data, patterns and the matcher follow the specification${sanitized ? ' without undefined behavior' : ''}`, {
    timeout: sanitized ? ENGINE_SANITIZER_BUDGET : ENGINE_TEST_BUDGET,
  }, async t => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-extension-values-'));
    try {
      await compileAndRunEngineFixture({
        signal: t.signal, root, directory, source: sourceForValues(),
        name: sanitized ? 'values-sanitize' : 'values',
        sources: ['value.c', 'number_text.c', 'whitespace.c', 'canonical.c', 'rule_length.c', 'rule_number.c', 'unicode_data.c', 'pattern_set.c', 'pattern.c', 'pattern_match.c'],
        compilerFlags: sanitized ? ['-fsanitize=undefined', '-fno-omit-frame-pointer'] : ['-O2'],
        runEnvironment: { ...process.env, UBSAN_OPTIONS: 'halt_on_error=1' },
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
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
  assert.equal(fixtures.length, 104,
    'Review C binding coverage when the shared fixture inventory changes');
  assert.equal(bindFixtures.length, 103,
    'Review C binding coverage when compilation error fixtures change');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-bind-'));
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForFixtures(), name: 'bind-fixtures',
      sources: [
        'value.c', 'number_text.c', 'value_path.c', 'engine_error.c', 'expression.c',
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
        'value.c', 'number_text.c', 'value_path.c', 'engine_error.c', 'expression.c',
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
        'value.c', 'number_text.c', 'value_path.c', 'engine_error.c', 'expression.c',
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
  assert.equal(fixtures.length, 104,
    'Review C rendering coverage when the shared fixture inventory changes');
  assert.equal(renderFixtures.length, 102,
    'Review C rendering coverage when successful fixtures change');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-render-'));
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForFixtures(), name: 'render-fixtures',
      sources: [
        'value.c', 'number_text.c', 'value_path.c', 'engine_error.c', 'expression.c',
        'runtime.c', 'date.c', 'design.c', 'widget.c', 'messages.c', 'binding.c', 'html.c', 'render.c',
      ],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('PHP extension engine form rendering does not depend on a comma decimal locale', { timeout: ENGINE_TEST_BUDGET }, async t => {
  await runUnderCommaLocale({
    signal: t.signal, root, prefix: 'crudui-c-render-locale-', name: 'render-fixtures-locale', source: sourceForFixtures(),
    sources: [
      'value.c', 'number_text.c', 'value_path.c', 'engine_error.c', 'expression.c',
      'runtime.c', 'date.c', 'design.c', 'widget.c', 'messages.c', 'binding.c', 'html.c', 'render.c',
    ],
  });
});

test('PHP extension engine form rendering has no undefined behavior findings', { timeout: ENGINE_SANITIZER_BUDGET }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-render-sanitize-'));
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForFixtures(), name: 'render-fixtures-sanitize',
      sources: [
        'value.c', 'number_text.c', 'value_path.c', 'engine_error.c', 'expression.c',
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
  'value.c', 'number_text.c', 'value_path.c', 'engine_error.c', 'expression.c',
  'runtime.c', 'date.c', 'design.c', 'compose.c', 'declaration.c', 'html.c', 'list.c',
];

test('PHP extension engine renders the complete list target as exact HTML', { timeout: ENGINE_TEST_BUDGET }, async t => {
  assert.equal(fixtures.length, 62,
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

test('PHP extension engine list rendering does not depend on a comma decimal locale', { timeout: ENGINE_TEST_BUDGET }, async t => {
  await runUnderCommaLocale({
    signal: t.signal, root, prefix: 'crudui-c-list-locale-', name: 'list-fixtures-locale', source: sourceForFixtures(), sources,
  });
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
  'value.c', 'number_text.c', 'value_path.c', 'engine_error.c', 'expression.c',
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
      sources: ['value.c', 'number_text.c', 'engine_error.c', 'key.c'],
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
        'value.c', 'number_text.c', 'value_path.c', 'engine_error.c', 'compose.c', 'declaration.c', 'template.c',
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

{
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
/* Byte strings and whether each is a sequence of Unicode scalar values (docs/spec/input-text.md). */
const textBytes = [
  [[], true], [[0x00, 0x41], true], [[0xc3, 0xa9], true], [[0xed, 0x9f, 0xbf], true], [[0xee, 0x80, 0x80], true],
  [[0xef, 0xbf, 0xbf], true], [[0xf0, 0x9f, 0x98, 0x80], true], [[0xf4, 0x8f, 0xbf, 0xbf], true],
  [[0xff], false], [[0x61, 0x80], false], [[0xe2, 0x82], false], [[0xc0, 0xaf], false], [[0xe0, 0x80, 0xaf], false],
  [[0xed, 0xa0, 0x80], false], [[0xed, 0xbf, 0xbf], false], [[0xf4, 0x90, 0x80, 0x80], false],
  [[0xf8, 0x88, 0x80, 0x80, 0x80], false], [[0xf0, 0x9f, 0x98], false],
];
function sourceForText() {
  const cases = textBytes.map(([bytes, valid]) =>
    `    {(const uint8_t *)"${bytes.map(byte => `\\${byte.toString(8).padStart(3, '0')}`).join('')}", ${bytes.length}, ${valid}},`);
  return [
    '#include <stdio.h>',
    '#include "crudui_engine.h"',
    'int main(void) {',
    '  static const struct { const uint8_t *bytes; size_t length; bool valid; } cases[] = {',
    ...cases,
    '  };',
    '  int failed = 0;',
    '  for (size_t i = 0; i < sizeof(cases) / sizeof(cases[0]); ++i) {',
    '    ps_value *value = ps_value_new(PS_NULL);',
    '    ps_value *object = ps_value_new(PS_OBJECT);',
    '    bool stored = ps_value_string(value, cases[i].bytes, cases[i].length);',
    '    bool named = ps_value_insert(object, cases[i].bytes, cases[i].length, ps_value_new(PS_NULL));',
    '    if (ps_text_valid(cases[i].bytes, cases[i].length) != cases[i].valid || stored != cases[i].valid || named != cases[i].valid) {',
    '      printf("text case %zu differs\\n", i);',
    '      failed = 1;',
    '    }',
    '    ps_value_free(value);',
    '    ps_value_free(object);',
    '  }',
    '  return failed;',
    '}',
    '',
  ].join('\n');
}

test('PHP extension engine text is exactly Unicode scalar values', { timeout: ENGINE_TEST_BUDGET }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-c-text-'));
  try {
    await compileAndRunEngineFixture({
      signal: t.signal, root, directory, source: sourceForText(), name: 'text-valid',
      sources: ['value.c', 'number_text.c'],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
}
