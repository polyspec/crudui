#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, mkdtemp, stat, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
let dispatch, errorRecord;
import { parseCLIResponse, OperationError, equalOrdered, equalModels, equalState } from './protocol.mjs';
import { formScenarios, numberCases, companySpec, companyData, row, imageCase, urlCase, dateCases, dateFormSpec, dateFormData, dateListSpec } from './cases.mjs';
import { runRustCommand } from '../../scripts/run-rust-command.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
let extension, reportPath;
let sourceCommit = process.env.CRUDUI_SOURCE_COMMIT;
for (let index = 0; index < argv.length; index++) {
  const flag = argv[index], value = argv[++index];
  if (!value || !['--extension', '--report', '--source-commit'].includes(flag)) throw new Error('Usage: node tests/native-generators/run.mjs --extension /absolute/crudui.so [--report path] [--source-commit hash]');
  if (flag === '--extension') extension = value;
  else if (flag === '--source-commit') sourceCommit = value;
  else reportPath = path.resolve(value);
}
const buildDirectory = await mkdtemp(path.join(os.tmpdir(), 'crudui-native-generators-'));
const report = { completed: false, passed: false, targets: [], checks: [], buildDirectory };
const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const jsonValue = value => JSON.parse(JSON.stringify(value));
const stateOnly = value => ({ data: value.data, fields: value.fields, html: value.html, revision: value.revision });

function execute(command, args, options = {}) {
  return new Promise(resolve => {
    let stdout = '', stderr = '', failure, timedOut = false;
    const child = spawn(command, args, { cwd: options.cwd ?? ROOT, env: options.env ?? process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, options.timeout ?? 30000);
    child.stdout.on('data', data => { stdout += data; if (stdout.length > 32 * 1024 * 1024) { failure = new Error('CLI response exceeds 32 MiB'); child.kill('SIGKILL'); } });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', error => { failure = error; });
    child.on('close', (status, signal) => { clearTimeout(timer); resolve({ status, signal, stdout, stderr, error: failure ?? (timedOut ? new Error('CLI timed out') : undefined) }); });
    child.stdin.on('error', error => { if (error.code !== 'EPIPE') failure = error; });
    child.stdin.end(options.input ?? '');
  });
}

async function inputManifest() {
  const entries = {};
  const excluded = new Set(['node_modules', 'vendor', 'target', 'dist', 'build', 'modules', '.libs', '.git', '.phpunit.cache', 'autom4te.cache']);
  const sourceFile = /\.(?:ts|tsx|js|mjs|cjs|go|rs|php|c|h|css|html|vue|svelte|json|ya?ml|toml|lock|mod|sum|xml|m4)$/;
  const walk = async (relative, built = false) => {
    const directory = await readdir(path.join(ROOT, relative), { withFileTypes: true });
    for (const entry of directory.sort((a, b) => a.name.localeCompare(b.name))) {
      const file = `${relative}/${entry.name}`;
      if (entry.isDirectory() && (built || !excluded.has(entry.name))) await walk(file, built);
      else if (entry.isFile() && (built ? /\.(?:js|mjs|cjs)$/.test(file) : sourceFile.test(file) || entry.name === 'Makefile')) {
        entries[file] = digest(await readFile(path.join(ROOT, file)));
      }
    }
  };
  const packages = await readdir(path.join(ROOT, 'packages'), { withFileTypes: true });
  for (const entry of packages.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory() && /^(?:generator-|validator-|php-ext$)/.test(entry.name)) await walk(`packages/${entry.name}`);
  }
  for (const directory of ['tests/native-generators', 'tests/fixtures/form-render', 'tests/fixtures/list-render']) await walk(directory);
  for (const directory of ['packages/generator-core/dist', 'packages/generator-react/dist', 'packages/validator-ts/dist']) await walk(directory, true);
  for (const file of ['package.json', 'package-lock.json']) entries[file] = digest(await readFile(path.join(ROOT, file)));
  if (extension) {
    try { entries[extension] = digest(await readFile(extension)); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      entries[extension] = { unavailable: error.code };
    }
  }
  return { ...(sourceCommit ? { commit: sourceCommit } : {}), digest: digest(entries), files: entries };
}

async function build(command, args, cwd) {
  const result = await execute(command, args, { cwd, timeout: 300000 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null, `Build terminated: ${result.signal}`);
  assert.equal(result.status, 0, `${command} build failed:\n${result.stderr}\n${result.stdout}`);
}
const goBinary = path.join(buildDirectory, 'generate-go');
const rustBinary = path.join(ROOT, 'packages/generator-rust/target/debug/generate');
const phpCLI = path.join(ROOT, 'packages/generator-php/bin/generate.php');
const phpLiteral = value => "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
function phpProvenanceSource(autoload) {
  const load = autoload ? `require ${phpLiteral(path.join(ROOT, 'packages/generator-php/vendor/autoload.php'))};` : '';
  return `${load}$out=[];foreach(['generator'=>'CRUDUI\\Generator','validator'=>'CRUDUI\\Validator','form'=>'CRUDUI\\Form'] as $key=>$class){$out[$key]=class_exists($class,false) ? (new ReflectionClass($class))->isInternal() : ${autoload ? '((new ReflectionClass($class))->isInternal())' : 'null'};}echo json_encode($out);`;
}
const targets = [
  { name: 'javascript', command: process.execPath, args: [path.join(ROOT, 'tests/native-generators/javascript.mjs')], prepare: async () => {} },
  { name: 'html', command: process.execPath, args: [path.join(ROOT, 'tests/native-generators/javascript.mjs'), '--renderer', 'html'], prepare: async () => {} },
  { name: 'php', command: process.env.PHP ?? 'php', args: [phpCLI], prepare: async () => {
    await stat(path.join(ROOT, 'packages/generator-php/vendor/autoload.php'));
    const result = await execute(process.env.PHP ?? 'php', ['-r', phpProvenanceSource(true)]);
    assert.equal(result.status, 0, result.stderr); assert.equal(result.signal, null);
    assert.equal(result.stderr, '', 'PHP class inspection produced diagnostics');
    assert.deepEqual(JSON.parse(result.stdout), { generator: false, validator: false, form: false }, 'Pure PHP target must use PHP classes; disable the native extension in its configuration');
  } },
  { name: 'go', command: goBinary, args: [], prepare: () => build(process.env.GO ?? 'go', ['build', '-o', goBinary, './cmd/generate'], path.join(ROOT, 'packages/generator-go')) },
  {
    name: 'rust',
    command: rustBinary,
    args: [],
    prepare: () => runRustCommand(['build', '--locked', '--bin', 'generate'], {
      cwd: path.join(ROOT, 'packages/generator-rust'),
    }),
  },
  { name: 'php-native', command: process.env.PHP ?? 'php', args: ['-d', `extension=${extension ?? ''}`, phpCLI], prepare: async () => {
    assert.ok(extension && path.isAbsolute(extension), '--extension must provide an absolute native PHP module path');
    assert.ok((await stat(extension)).isFile(), 'Native PHP module must be a file');
    const source = phpProvenanceSource(false);
    const result = await execute(process.env.PHP ?? 'php', ['-d', `extension=${extension}`, '-r', source]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.signal, null);
    assert.equal(result.stderr, '', 'Native PHP class inspection produced diagnostics');
    assert.deepEqual(JSON.parse(result.stdout), { generator: true, validator: true, form: true }, 'Native PHP target must register all common native classes');
  } },
];

async function invoke(target, request, timezone) {
  const args = timezone && target.name.startsWith('php') ? ['-d', `date.timezone=${timezone}`, ...target.args] : target.args;
  const result = await execute(target.command, args, { input: JSON.stringify(request), env: timezone ? { ...process.env, TZ: timezone } : process.env });
  if (result.stderr) report.checks.push({ target: target.name, case: request.operation, diagnostic: result.stderr, passed: false });
  return parseCLIResponse(request, result);
}
function oracle(request) { return jsonValue(dispatch(jsonValue(request))); }
async function check(target, name, operation) {
  try {
    const details = await operation();
    report.checks.push({ target: target.name, case: name, passed: true, ...details });
  } catch (error) {
    report.checks.push({ target: target.name, case: name, passed: false, error: { name: error.name, message: error.message, code: error.code, at: error.at, expected: error.expected, actual: error.actual } });
    process.stderr.write(`${target.name}: ${name}: ${error.message.split('\n')[0]}\n`);
  }
}
function compareError(actual, expected) {
  assert.ok(actual, 'Expected operation to fail');
  assert.equal(actual.code, expected.code, 'Error code differs');
  assert.equal(actual.message, expected.message, 'Error message differs');
  assert.equal(actual.at, expected.at, 'Error path differs');
}
function compareForm(actual, expected, initial) {
  equalState(actual, expected);
  assert.equal(actual.steps.length, expected.steps.length);
  let previous = stateOnly(initial);
  for (let index = 0; index < actual.steps.length; index++) {
    const a = actual.steps[index], e = expected.steps[index];
    equalState(a, e);
    equalOrdered(a.result, e.result, `steps[${index}].result`);
    if (e.error === null) assert.equal(a.error, null);
    else { compareError(a.error, e.error); equalState(a, previous); }
    previous = stateOnly(a);
  }
}

report.inputs = { start: await inputManifest() };
({ dispatch, errorRecord } = await import('./javascript.mjs'));

const formCases = JSON.parse(await readFile(path.join(ROOT, 'tests/fixtures/form-render/cases.json'), 'utf8'));
const listCases = JSON.parse(await readFile(path.join(ROOT, 'tests/fixtures/list-render/cases.json'), 'utf8'));
assert.equal(formCases.length, 92, 'The form fixture inventory changed; review coverage before changing this assertion');
assert.equal(listCases.length, 21, 'The list fixture inventory changed; review coverage before changing this assertion');

for (const target of targets) {
  const status = { name: target.name, available: false, passed: false, command: target.command, args: target.args };
  report.targets.push(status);
  try { await target.prepare(); status.available = true; }
  catch (error) { status.error = error.message; process.stderr.write(`${target.name}: unavailable: ${error.message}\n`); continue; }

  for (const fixture of formCases) await check(target, `form-fixture:${fixture.name}`, async () => {
    const compileRequest = { operation: 'compileForm', spec: fixture.spec, options: fixture.options ?? {} };
    const bindingOptions = Object.fromEntries(Object.entries(fixture.options ?? {}).filter(([key]) => ['idPrefix', 'language', 'keyPrefix', 'unsupported'].includes(key)));
    let expectedTemplate, expectedFields, expectedError;
    try { expectedTemplate = oracle(compileRequest); expectedFields = oracle({ operation: 'bindForm', template: expectedTemplate, data: (Object.hasOwn(fixture, 'data') ? fixture.data : {}), options: bindingOptions }); }
    catch (error) { expectedError = errorRecord(error); }
    if (fixture.expectError) assert.equal(expectedError?.code, fixture.expectError.code, 'JavaScript does not meet declared fixture error expectation');
    else assert.equal(expectedError, undefined, 'JavaScript unexpectedly rejected a fixture');
    let actualTemplate, actualFields, actualError;
    try {
      actualTemplate = await invoke(target, compileRequest);
      actualFields = await invoke(target, { operation: 'bindForm', template: actualTemplate, data: (Object.hasOwn(fixture, 'data') ? fixture.data : {}), options: bindingOptions });
    } catch (error) { if (!(error instanceof OperationError)) throw error; actualError = error; }
    if (expectedError) { compareError(actualError, expectedError); return { errorCode: actualError.code }; }
    assert.equal(actualError, undefined);
    equalOrdered(actualTemplate, expectedTemplate, '$.template');
    equalModels(actualFields, expectedFields);
    const foreignFields = await invoke(target, { operation: 'bindForm', template: expectedTemplate, data: (Object.hasOwn(fixture, 'data') ? fixture.data : {}), options: bindingOptions });
    equalModels(foreignFields, expectedFields);
    equalModels(oracle({ operation: 'bindForm', template: actualTemplate, data: (Object.hasOwn(fixture, 'data') ? fixture.data : {}), options: bindingOptions }), expectedFields);
    return { template: digest(actualTemplate), fields: digest(actualFields), interoperability: true };
  });

  for (const fixture of [...listCases, imageCase, urlCase]) await check(target, `list:${fixture.name}`, async () => {
    const request = { operation: 'renderList', spec: fixture.spec, rows: fixture.rows ?? [], options: fixture.options ?? {} };
    let expected, expectedError;
    try { expected = oracle(request); } catch (error) { expectedError = errorRecord(error); }
    if (fixture.expectError) assert.equal(expectedError?.code, fixture.expectError.code);
    let actual, actualError;
    try { actual = await invoke(target, request); } catch (error) { if (!(error instanceof OperationError)) throw error; actualError = error; }
    if (expectedError) { compareError(actualError, expectedError); return { errorCode: actualError.code }; }
    assert.equal(actualError, undefined);
    assert.equal(actual, expected, 'Raw list HTML differs');
    if (fixture === imageCase) assert.ok(actual.startsWith('<link rel="preload" as="image" href="/b.png"/><link rel="preload" as="image" href="/a.png"/>'));
    if (fixture === urlCase) assert.ok(!actual.includes('alert(1)'), 'Ordinary URL contains the rejected script');
    return { html: digest(actual), rawHTML: true };
  });

  for (const [index, item] of numberCases.entries()) await check(target, `number:${index}`, async () => {
    const format = { type: 'number' };
    if (Object.hasOwn(item, 'decimals')) format.decimals = item.decimals;
    const request = { operation: 'renderList', spec: { columns: { number: { field: '.number', format } } }, rows: [{ number: item.value }] };
    const expected = oracle(request), actual = await invoke(target, request);
    const cell = `<td class="list-td list-td-number">${item.expected}</td>`;
    assert.ok(expected.includes(cell), `JavaScript number does not match the explicit expectation ${item.expected}`);
    assert.ok(actual.includes(cell), `Native number does not match the explicit expectation ${item.expected}`);
    assert.equal(actual, expected);
    return { expectedNumber: item.expected, html: digest(actual) };
  });

  for (const scenario of formScenarios) await check(target, `instance:${scenario.name}`, async () => {
    const compileRequest = { operation: 'compileForm', spec: scenario.spec, options: scenario.compileOptions ?? {} };
    const template = oracle(compileRequest), nativeTemplate = await invoke(target, compileRequest);
    equalOrdered(nativeTemplate, template);
    const initialRequest = { operation: 'form', template: nativeTemplate, data: scenario.data, options: scenario.options ?? {}, actions: [] };
    const initial = await invoke(target, initialRequest), expectedInitial = oracle(initialRequest);
    equalState(initial, expectedInitial);
    const request = { ...initialRequest, actions: scenario.actions };
    const actual = await invoke(target, request), expected = oracle(request);
    compareForm(actual, expected, initial);
    if (scenario.rejectAll) assert.ok(actual.steps.every(step => step.error !== null), 'A declared rejected operation succeeded');
    if (scenario.name === 'keyed-order-and-scoped-operations') {
      assert.deepEqual(Object.keys(initial.data.companies), [row(5), row(7), row(1)]);
      assert.ok(actual.steps[2].html.includes(`form[companies][${row(5)}][stores][${row(42)}][name]`));
    }
    if (scenario.name === 'repeated-and-language-controls-retain-behavior') {
      assert.equal((actual.html.match(/ onchange=/g) ?? []).length, 4, 'Repeated or language controls lost behavior attributes');
    }
    if (scenario.name === 'explicit-null-does-not-apply-default') {
      assert.equal(actual.data.text, null);
      assert.equal(actual.data.display, null);
      assert.equal(actual.fields[0].widget.attrs.value, '');
      assert.equal(actual.fields[1].widget.rawHtml, '');
    }
    if (scenario.name === 'composition-removal-preserves-empty-object-default') {
      assert.deepEqual(nativeTemplate.fields[0].spec.default, {}, 'Composition changed an empty object to an array');
      assert.deepEqual(initial.data.value, {}, 'Form defaults changed an empty object to an array');
      assert.deepEqual(actual.data.value, {}, 'Data replacement changed an empty object to an array');
    }
    const injected = await invoke(target, { ...initialRequest, data: {}, actions: [{ method: 'setData', args: [scenario.data] }, { method: 'setData', args: [scenario.data] }] });
    for (const step of injected.steps) {
      assert.equal(step.error, null);
      equalOrdered(step.data, initial.data);
      equalModels(step.fields, initial.fields);
      assert.equal(step.html, initial.html, 'Repeated injection changes raw HTML');
    }
    return { data: digest(actual.data), fields: digest(actual.fields), html: digest(actual.html), steps: actual.steps.length, rawHTML: true };
  });

  await check(target, 'instance:nested-copy-fresh-keys-and-original-values', async () => {
    const template = await invoke(target, { operation: 'compileForm', spec: companySpec, options: { keyPrefix: 'form' } });
    const before = await invoke(target, { operation: 'form', template, data: companyData, options: { language: 'en' } });
    const actual = await invoke(target, { operation: 'form', template, data: companyData, options: { language: 'en' }, actions: [{ method: 'copyRow', args: ['companies', row(5)] }] });
    assert.equal(actual.steps[0].error, null);
    const key = actual.steps[0].result;
    assert.match(key, /^__[0-9a-f]{13}__$/);
    assert.ok(!Object.hasOwn(before.data.companies, key));
    assert.deepEqual(Object.keys(actual.data.companies), [row(5), key, row(7), row(1)]);
    for (const oldKey of Object.keys(before.data.companies)) equalOrdered(actual.data.companies[oldKey], before.data.companies[oldKey]);
    const copied = actual.data.companies[key], original = before.data.companies[row(5)];
    assert.equal(copied.name, original.name);
    const originalStores = Object.keys(original.stores), copiedStores = Object.keys(copied.stores);
    assert.equal(copiedStores.length, originalStores.length);
    for (let index = 0; index < copiedStores.length; index++) {
      assert.match(copiedStores[index], /^__[0-9a-f]{13}__$/);
      assert.ok(!Object.hasOwn(original.stores, copiedStores[index]));
      equalOrdered(copied.stores[copiedStores[index]], original.stores[originalStores[index]]);
    }
    const expected = oracle({ operation: 'form', template, data: actual.data, options: { language: 'en' } });
    equalOrdered(actual.data, expected.data);
    equalModels(actual.fields, expected.fields);
    assert.equal(actual.html, expected.html, 'HTML from the actual generated keys differs from JavaScript');
    const injected = await invoke(target, { operation: 'form', template, data: companyData, options: { language: 'en' }, actions: [{ method: 'setData', args: [actual.data] }] });
    equalOrdered(injected.data, actual.data);
    equalModels(injected.fields, actual.fields);
    assert.equal(injected.html, actual.html, 'Copied data injection changes raw HTML');
    return { actual, rawHTML: true, generatedKeysPreserved: true };
  });

  await check(target, 'instance:missing-repeated-data-creates-one-row', async () => {
    const spec = { type: 'group', properties: { tags: { type: 'text', multiple: true, default: 'new' } } };
    const template = await invoke(target, { operation: 'compileForm', spec });
    const actual = await invoke(target, { operation: 'form', template, data: {} });
    const keys = Object.keys(actual.data.tags);
    assert.equal(keys.length, 1); assert.match(keys[0], /^__[0-9a-f]{13}__$/); assert.equal(actual.data.tags[keys[0]], 'new');
    const expected = oracle({ operation: 'form', template, data: actual.data });
    equalState(actual, expected);
    return { actual, generatedKeysPreserved: true };
  });

  for (const [name, data] of [['null-root', null], ['array-root', []], ['null-collection', { companies: null }], ['array-collection', { companies: [] }], ['numeric-row-key', { companies: { 5: { name: 'Five', stores: {} } } }]]) await check(target, `reject:${name}`, async () => {
    const request = { operation: 'form', template: oracle({ operation: 'compileForm', spec: companySpec }), data };
    let expected;
    try { oracle(request); } catch (caught) { expected = errorRecord(caught); }
    assert.equal(expected?.code, 'INVALID_FORM_INPUT', 'JavaScript accepted invalid form input');
    let error;
    try { await invoke(target, request); } catch (caught) { if (!(caught instanceof OperationError)) throw caught; error = caught; }
    assert.ok(error, 'Invalid form input was accepted');
    compareError(error, expected);
    return { error: expected };
  });

  const groupSpec = { type: 'group', properties: { address: { type: 'group', properties: { city: { type: 'text' }, geo: { type: 'group', properties: { lat: { type: 'text' } } } } } } };
  const shapeRejections = [
    ['array-collection', companySpec, { companies: [] }, 'Repeated data must be a keyed object: companies'],
    ['null-collection', companySpec, { companies: null }, 'Repeated data must be a keyed object: companies'],
    ['scalar-collection', companySpec, { companies: 'one' }, 'Repeated data must be a keyed object: companies'],
    ['nested-array-collection', companySpec, { companies: { [row(1)]: { name: 'One', stores: [] } } }, `Repeated data must be a keyed object: companies.${row(1)}.stores`],
    ['scalar-group-row', companySpec, { companies: { [row(1)]: 'One' } }, `Group data must be an object: companies.${row(1)}`],
    ['null-nested-group-row', companySpec, { companies: { [row(1)]: { name: 'One', stores: { [row(2)]: null } } } }, `Group data must be an object: companies.${row(1)}.stores.${row(2)}`],
    ['scalar-group', groupSpec, { address: 'Seoul' }, 'Group data must be an object: address'],
    ['array-nested-group', groupSpec, { address: { city: 'Seoul', geo: [] } }, 'Group data must be an object: address.geo'],
  ];
  const declarationRejections = [
    ['multiple-string', { type: 'text', multiple: 'yes' }, 'Invalid multiple at rows: expected a boolean or an object'],
    ['multiple-min-string', { type: 'text', multiple: { min: '1' } }, 'Invalid multiple.min at rows: expected a number'],
    ['multiple-copy-object', { type: 'text', multiple: { copy: {} } }, 'Invalid multiple.copy at rows: expected a boolean'],
    ['design-array', { type: 'text', design: [] }, 'Invalid design at rows: expected a boolean or an object'],
    ['design-show-number', { type: 'text', design: { show: 1 } }, 'Invalid design.show at rows: expected an expression, a boolean or a condition map'],
    ['design-class-empty-map', { type: 'text', design: { class: {} } }, 'Invalid design.class at rows: expected a string or a condition map'],
    ['design-node-string', { type: 'text', design: { wrapper: 'box' } }, 'Invalid design.wrapper at rows: expected an object'],
    ['multiple-title-not-group', { type: 'text', multiple: { title: 'name' } }, 'Invalid multiple.title at rows: expected a repeated group'],
    ['multiple-title-repeated-child', { type: 'group', multiple: { title: 'tags' }, properties: { tags: { type: 'text', multiple: true } } }, 'Invalid multiple.title at rows: expected the name of a direct child field without multiple, properties or lang'],
    ['multiple-controls-unknown', { type: 'text', multiple: { controls: 'side' } }, 'Invalid multiple.controls at rows: expected header, footer or outline'],
    ['multiple-header-unknown', { type: 'text', multiple: { header: 'fixed' } }, 'Invalid multiple.header at rows: expected static or sticky'],
    ['lang-null', { type: 'text', lang: null }, 'Invalid lang at rows: expected a boolean or an object'],
    ['lang-only-mixed', { type: 'text', lang: { only: ['ko', 3] } }, 'Invalid lang.only at rows: expected a list of language codes or an object'],
    ['nested-design-node-style', { type: 'group', properties: { name: { type: 'text', design: { label: { style: null } } } } }, 'Invalid design.label.style at rows.name: expected a string or a condition map'],
  ];
  for (const [name, field, message] of declarationRejections) await check(target, `compile-reject:${name}`, async () => {
    const request = { operation: 'compileForm', spec: { type: 'group', properties: { rows: field } } };
    let expected;
    try { oracle(request); } catch (caught) { expected = errorRecord(caught); }
    assert.deepEqual(expected, { code: 'INVALID_FORM_INPUT', message, at: '' }, 'JavaScript does not meet the declaration rejection contract');
    let error;
    try { await invoke(target, request); } catch (caught) { if (!(caught instanceof OperationError)) throw caught; error = caught; }
    assert.ok(error, 'A declaration with a wrong value type was accepted');
    compareError(error, expected);
    return { error: expected };
  });
  const optionRejections = [
    ['language-number', { language: 5, keyPrefix: 5 }, 'Language must be a string'],
    ['key-prefix-number', { language: 'fr', keyPrefix: 5 }, 'keyPrefix must be a string'],
    ['id-prefix-array', { idPrefix: [] }, 'idPrefix must be a string'],
    ['unsupported-boolean', { unsupported: true }, 'unsupported must be throw or marker'],
    ['unsupported-other', { language: 'fr', unsupported: 'other' }, 'unsupported must be throw or marker'],
    ['language-unsupported', { language: 'fr', idPrefix: null }, 'Unsupported language: fr'],
  ];
  for (const [name, options, message] of optionRejections) for (const operation of ['bindForm', 'form']) await check(target, `${operation}-option-reject:${name}`, async () => {
    const request = { operation, template: oracle({ operation: 'compileForm', spec: companySpec }), data: companyData, options };
    let expected;
    try { oracle(request); } catch (caught) { expected = errorRecord(caught); }
    assert.deepEqual(expected, { code: 'INVALID_FORM_INPUT', message, at: '' }, 'JavaScript does not meet the option rejection contract');
    let error;
    try { await invoke(target, request); } catch (caught) { if (!(caught instanceof OperationError)) throw caught; error = caught; }
    assert.ok(error, 'An option with the wrong type was accepted');
    compareError(error, expected);
    return { error: expected };
  });
  for (const [name, spec, data, message] of shapeRejections) for (const operation of ['bindForm', 'form']) await check(target, `${operation}-shape-reject:${name}`, async () => {
    const request = { operation, template: oracle({ operation: 'compileForm', spec }), data };
    let expected;
    try { oracle(request); } catch (caught) { expected = errorRecord(caught); }
    assert.deepEqual(expected, { code: 'INVALID_FORM_INPUT', message, at: '' }, 'JavaScript does not meet the data shape rejection contract');
    let error;
    try { await invoke(target, request); } catch (caught) { if (!(caught instanceof OperationError)) throw caught; error = caught; }
    assert.ok(error, 'Data with the wrong shape was accepted');
    compareError(error, expected);
    return { error: expected };
  });

  for (const timezone of ['UTC', 'Asia/Seoul', 'America/Los_Angeles']) await check(target, `dates:${timezone}`, async () => {
    const template = await invoke(target, { operation: 'compileForm', spec: dateFormSpec }, timezone);
    const request = { operation: 'form', template, data: dateFormData, options: { idPrefix: 'utc-dates' } };
    const initial = await invoke(target, request, timezone), expected = oracle(request);
    equalState(initial, expected);
    equalOrdered(initial.data, dateFormData);
    for (const [index, item] of dateCases.entries()) {
      assert.equal(initial.fields[index * 2].widget.attrs.value, item.date, `Date control changed ${JSON.stringify(item.value)}`);
      assert.equal(initial.fields[index * 2 + 1].widget.attrs.value, item.datetime, `Datetime control changed ${JSON.stringify(item.value)}`);
    }
    const injected = await invoke(target, { ...request, data: {}, actions: [{ method: 'setData', args: [dateFormData] }, { method: 'setData', args: [{}] }, { method: 'setData', args: [dateFormData] }] }, timezone);
    for (const step of [injected.steps[0], injected.steps[2]]) {
      assert.equal(step.error, null);
      equalOrdered(step.data, initial.data);
      equalModels(step.fields, initial.fields);
      assert.equal(step.html, initial.html, 'Date injection or restoration changes raw HTML');
    }
    const empty = oracle({ ...request, data: {} });
    assert.equal(injected.steps[1].error, null);
    equalOrdered(injected.steps[1].data, empty.data);
    equalModels(injected.steps[1].fields, empty.fields);
    assert.equal(injected.steps[1].html, empty.html, 'Clearing date values changes empty-form HTML');
    const listRequest = { operation: 'renderList', spec: dateListSpec, rows: dateCases.map(item => ({ value: item.value })) };
    const html = await invoke(target, listRequest, timezone);
    assert.equal(html, oracle(listRequest), 'UTC list HTML differs');
    const cells = [...html.matchAll(/<td class="list-td list-td-date">(.*?)<\/td>/g)].map(match => match[1]);
    assert.deepEqual(cells, dateCases.map(item => item.date === item.value && item.datetime === item.value ? item.value : item.datetime.replace('T', ' ')), 'List date values differ from explicit expectations');
    return { timezone, dateValues: dateCases.length, html: digest(html), fields: digest(initial.fields), rawHTML: true };
  });

  status.checks = report.checks.filter(check => check.target === target.name).length;
  status.failures = report.checks.filter(check => check.target === target.name && !check.passed).length;
  status.passed = status.failures === 0;
  process.stdout.write(`${target.name}: ${status.checks - status.failures}/${status.checks} checks passed\n`);
}
try {
  report.inputs.end = await inputManifest();
  assert.deepEqual(report.inputs.end, report.inputs.start, 'Source or runtime artifacts changed while the conformance suite was running');
  report.checks.push({ target: 'suite', case: 'unchanged-inputs', passed: true });
} catch (error) {
  report.checks.push({ target: 'suite', case: 'unchanged-inputs', passed: false, error: { message: error.message, expected: error.expected, actual: error.actual } });
}
report.completed = true;
report.passed = report.targets.length === targets.length &&report.targets.every(target => target.available && target.passed) && report.checks.every(check => check.passed);
report.summary = { passed: report.checks.filter(check => check.passed).length, failed: report.checks.filter(check => !check.passed).length, unavailable: report.targets.filter(target => !target.available).map(target => target.name) };
// A passing run removes its build directory; a failing run keeps it for inspection.
if (report.passed) {
  await rm(buildDirectory, { recursive: true, force: true });
  delete report.buildDirectory;
} else {
  process.stderr.write(`Build directory retained: ${buildDirectory}\n`);
}
if (reportPath) { await mkdir(path.dirname(reportPath), { recursive: true }); await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`); }
process.stdout.write(`${JSON.stringify(report.summary)}\n`);
if (!report.passed) process.exitCode = 1;
