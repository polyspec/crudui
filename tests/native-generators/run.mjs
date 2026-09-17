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
import { recordConformance } from '../conformance/evidence.mjs';
import { createProgress } from '../../scripts/test-progress/progress.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const USAGE = 'Usage: node tests/native-generators/run.mjs --extension /absolute/crudui.so [--report path] [--source-commit hash] [--target names] [--check patterns]';
const argv = process.argv.slice(2);
let extension, reportPath;
let sourceCommit = process.env.CRUDUI_SOURCE_COMMIT;
const selectedTargets = [], checkPatterns = [];
for (let index = 0; index < argv.length; index++) {
  const flag = argv[index], value = argv[++index];
  if (!value || !['--extension', '--report', '--source-commit', '--target', '--check'].includes(flag)) throw new Error(USAGE);
  if (flag === '--extension') extension = value;
  else if (flag === '--source-commit') sourceCommit = value;
  else if (flag === '--target') selectedTargets.push(...value.split(',').filter(Boolean));
  else if (flag === '--check') checkPatterns.push(...value.split(',').filter(Boolean));
  else reportPath = path.resolve(value);
}
const buildDirectory = await mkdtemp(path.join(os.tmpdir(), 'crudui-native-generators-'));
const report = { completed: false, passed: false, targets: [], checks: [], buildDirectory };
if (selectedTargets.length || checkPatterns.length) report.filter = { targets: selectedTargets, checks: checkPatterns };

// A run reports what it is doing while it runs: every check
// prints its own start, its elapsed time and its result.
const suiteStart = Date.now();
const seconds = since => `${((Date.now() - since) / 1000).toFixed(1)}s`;
// Every check prints its start, a line while it keeps running, and its result.
const lines = createProgress({ write: text => process.stdout.write(text) });
const progress = text => lines.line(text);
const RUNNING_INTERVAL = 5000;
// A check id is `group:case`; the group selects the time budget.
const groupOf = name => name.includes(':') ? name.slice(0, name.indexOf(':')) : name;
const pattern = text => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, character => character === '*' ? '.*' : `\\${character}`)}$`);
const checkFilters = checkPatterns.map(pattern);
const selectsCheck = name => checkFilters.length === 0 || checkFilters.some(filter => filter.test(name) || filter.test(groupOf(name)));
let selectedCount = 0;

// Time budgets are sized from the measured duration of the slowest check in each
// group. Measured on macOS (Apple silicon) across all six targets: form fixtures
// 385 ms, form instances 335 ms, timezone cases 282 ms, detail 124 ms and every other
// group under 100 ms. The budgets below hold for a machine an order of magnitude
// slower. A check that exceeds its budget is killed with the processes it started,
// is reported by id and fails the run, and the next check continues.
const CHECK_BUDGETS = [
  [/^(?:form-fixture|instance|dates)$/, 20000],
];
const DEFAULT_CHECK_BUDGET = 10000;
const checkBudget = name => (CHECK_BUDGETS.find(([match]) => match.test(groupOf(name))) ?? [, DEFAULT_CHECK_BUDGET])[1];
// Preparation builds the Go and Rust generators; a cold Cargo build dominates it.
const PREPARE_BUDGET = { go: 300000, rust: 900000 };
const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const jsonValue = value => JSON.parse(JSON.stringify(value));
const stateOnly = value => ({ data: value.data, fields: value.fields, html: value.html, revision: value.revision });

// The signal of the running check; every process it starts is killed when its budget expires.
let currentSignal;

function execute(command, args, options = {}) {
  const signal = options.signal ?? currentSignal;
  return new Promise(resolve => {
    let stdout = '', stderr = '', failure, timedOut = false, settled = false;
    const settle = (status, processSignal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status, signal: processSignal, stdout, stderr, error: failure ?? (timedOut ? new Error('CLI timed out') : undefined) });
    };
    if (signal?.aborted) {
      failure = new Error('Check budget expired before the process started');
      resolve({ status: null, signal: null, stdout, stderr, error: failure });
      return;
    }
    const child = spawn(command, args, { cwd: options.cwd ?? ROOT, env: options.env ?? process.env, stdio: ['pipe', 'pipe', 'pipe'], signal, killSignal: 'SIGKILL' });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, options.timeout ?? 30000);
    child.stdout.on('data', data => { stdout += data; if (stdout.length > 32 * 1024 * 1024) { failure = new Error('CLI response exceeds 32 MiB'); child.kill('SIGKILL'); } });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', error => { failure = error; settle(null, null); });
    child.on('close', (status, processSignal) => settle(status, processSignal));
    child.stdin.on('error', error => { if (error.code !== 'EPIPE') failure = error; });
    child.stdin.end(options.input ?? '');
  });
}

/** Run one command for the Rust toolchain resolver, honoring the running check's budget. */
function runCommand(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const capture = options.capture ?? false;
    const child = spawn(executable, args, {
      cwd: options.cwd, env: options.environment, signal: currentSignal, killSignal: 'SIGKILL',
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
    });
    let stdout = '', stderr = '';
    if (capture) {
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
    }
    child.once('error', reject);
    child.once('close', (status, signal) => {
      if (status === 0 && signal === null) resolve({ stdout, stderr });
      else reject(new Error(`Command failed (${signal ?? status ?? 'unknown'}): ${[executable, ...args].join(' ')}${capture && stderr.trim() ? `: ${stderr.trim()}` : ''}`));
    });
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
  for (const directory of ['tests/native-generators', 'tests/fixtures/form-render', 'tests/fixtures/list-render', 'tests/fixtures/detail-render']) await walk(directory);
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
// Each language's process is a program beside this suite that calls its package's public API.
const programs = path.join(ROOT, 'tests/native-generators/programs');
const goBinary = path.join(buildDirectory, 'generate-go');
const rustBinary = path.join(programs, 'rust/target/debug/crudui-native-generator');
const phpCLI = path.join(programs, 'php/generate.php');
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
  { name: 'go', command: goBinary, args: [], prepare: () => build(process.env.GO ?? 'go', ['build', '-o', goBinary, '.'], path.join(programs, 'go')) },
  {
    name: 'rust',
    command: rustBinary,
    args: [],
    prepare: () => runRustCommand(['build', '--locked'], {
      cwd: path.join(programs, 'rust'), run: runCommand,
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

/**
 * Conformance evidence of one check: the model features a target proves as its own runtime, and
 * the HTML features it proves as a string renderer. The React reference proves no HTML feature
 * (it is the expected output), and the HTML renderer proves no model feature (it shares the
 * JavaScript model).
 */
function recordEvidence(target, proves, passed) {
  const runtimes = [
    ...(target.name === 'html' ? [] : (proves.model ?? []).map(feature => [feature, target.name])),
    ...(target.name === 'javascript' ? [] : (proves.html ?? []).map(feature => [feature, target.name === 'html' ? 'javascript-html' : target.name])),
  ];
  for (const [feature, runtime] of runtimes) recordConformance({ feature, fixture: proves.fixture, runtime, case: proves.case, passed });
}

async function check(target, name, operation, proves) {
  if (!selectsCheck(name)) return;
  selectedCount++;
  const id = `${target.name} › ${name}`;
  const started = Date.now(), budget = checkBudget(name);
  const controller = new AbortController();
  const previousSignal = currentSignal;
  currentSignal = controller.signal;
  let expired;
  lines.start(id);
  const budgetTimer = setTimeout(() => {
    expired = new Error(`${name} exceeded its ${budget} ms budget; the check and its processes were stopped`);
    controller.abort(expired);
  }, budget);
  const expiry = new Promise((resolve, reject) => controller.signal.addEventListener('abort', () => reject(expired), { once: true }));
  expiry.catch(() => {});
  try {
    const details = await Promise.race([operation(), expiry]);
    report.checks.push({ target: target.name, case: name, passed: true, durationMs: Date.now() - started, ...details });
    if (proves) recordEvidence(target, proves, true);
    lines.pass(id, Date.now() - started);
  } catch (error) {
    const failure = expired ?? error;
    if (proves) recordEvidence(target, proves, false);
    report.checks.push({ target: target.name, case: name, passed: false, durationMs: Date.now() - started, timedOut: expired !== undefined, error: { name: failure.name, message: failure.message, code: failure.code, at: failure.at, expected: failure.expected, actual: failure.actual } });
    lines.fail(id, Date.now() - started, failure.message);
  } finally {
    clearTimeout(budgetTimer);
    currentSignal = previousSignal;
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

progress('inputs: hashing sources and built artifacts');
const manifestStart = Date.now();
report.inputs = { start: await inputManifest() };
progress(`inputs: ${Object.keys(report.inputs.start.files).length} files hashed (${seconds(manifestStart)})`);
({ dispatch, errorRecord } = await import('./javascript.mjs'));

const formCases = JSON.parse(await readFile(path.join(ROOT, 'tests/fixtures/form-render/cases.json'), 'utf8'));
// Specifications written with array-index member names out of numeric order.
const orderTemplateText = (() => {
  const template = JSON.stringify(jsonValue(dispatch({ operation: 'compileForm', spec: { type: 'group', properties: { s: { type: 'select', label: 'S', items: { x: 'Ex', 1: 'One', 2: 'Two' } } } } })));
  const written = '"items":{"2":"Two","x":"Ex","1":"One"}';
  const parsedOrder = '"items":{"1":"One","2":"Two","x":"Ex"}';
  assert.equal(template.split(parsedOrder).length, 2, 'The member order template must hold one items map');
  return template.replace(parsedOrder, written);
})();
const memberOrderRequests = [
  ['compile-properties', '{"operation":"compileForm","spec":{"type":"group","properties":{"b":{"type":"text","label":"B"},"10":{"type":"text","label":"Ten"},"a":{"type":"text","label":"A"}}}}'],
  ['compile-composed-properties', '{"operation":"compileForm","spec":{"type":"group","properties":{"$ref":"base.json","$patch":{"10":{"type":"text","label":"Ten"}}}},"options":{"files":{"base.json":{"properties":{"b":{"type":"text","label":"B"},"a":{"type":"text","label":"A"}}}}}}'],
  ['compile-unknown-key', '{"operation":"compileForm","spec":{"type":"group","properties":{"rows":{"type":"text","multiple":{"z":1,"5":1}}}}}'],
  ['bind-select-items', `{"operation":"bindForm","template":${orderTemplateText},"data":{},"options":{}}`],
  ['render-list-columns', '{"operation":"renderList","spec":{"columns":{"b":{"field":"b","label":"B"},"10":{"field":"ten","label":"Ten"},"a":{"field":"a","label":"A"}}},"rows":[{"a":"x","b":"y","ten":"z"}],"options":{"language":"en"}}'],
  ['build-crudui-detail__fields', '{"operation":"buildDetail","spec":{"fields":{"b":{"field":"b","label":"B"},"10":{"field":"ten","label":"Ten"},"a":{"field":"a","label":"A"}}},"record":{"a":"x","b":"y","ten":"z"},"options":{"language":"en"}}'],
  ['render-crudui-detail__fields', '{"operation":"renderDetail","spec":{"fields":{"b":{"field":"b","label":"B"},"10":{"field":"ten","label":"Ten"},"a":{"field":"a","label":"A"}}},"record":{"a":"x","b":"y","ten":"z"},"options":{"language":"en"}}'],
];
// Requests written as standard input text, checked at the process boundary of every program.
const requestCases = (() => {
  const compiled = spec => JSON.stringify(jsonValue(dispatch({ operation: 'compileForm', spec })));
  const empty = compiled({ type: 'group', properties: {} });
  const named = compiled({ type: 'group', properties: { name: { type: 'text' } } });
  const rows = compiled({ type: 'group', properties: { rows: { type: 'text', multiple: true } } });
  const limited = compiled({ type: 'group', properties: { rows: { type: 'text', multiple: { max: 1 } } } });
  const buttons = compiled({ type: 'group', buttons: [{ type: 'link', text: { ko: '목록', en: 'List' }, href: '../?a=1&b="2"' }, { type: 'submit', name: '__submitted__', value: 'go', design: { class: { 'name == "a"': 'primary', true: 'plain' }, style: 'color: red; width: 5px' } }, { type: 'button', text: 'Back <now>', behavior: { onclick: { label: 'x', script: 'history.back()' } } }], properties: { name: { type: 'text' } } });
  const bareTemplate = '{"kind":"crudui/form-template","fields":[],"buttons":[]}';
  const list = '{"columns":{"v":{"field":"v","label":"V"}}}';
  const detail = '{"fields":{"v":{"field":"v"}}}';
  const evaluated = dispatch({ operation: 'bindButtons', template: JSON.parse(buttons), data: { name: 'a' }, options: { language: 'en' } });
  return [
    ['text-two-values', '{} {}'], ['text-truncated', '{'], ['text-empty', ''],
    ['null', 'null'], ['array', '[]'], ['string', '"compileForm"'], ['no-operation', '{}'], ['unknown-operation', '{"operation":"render"}'],
    ...['compileForm', 'bindForm', 'bindButtons', 'form', 'renderList', 'buildList', 'formButtonsHtml'].map(operation => [`missing-input-${operation}`, `{"operation":"${operation}"}`]),
    ['options-null', `{"operation":"form","template":${empty},"options":null}`],
    ['options-array', `{"operation":"bindButtons","template":${bareTemplate},"options":[]}`],
    ['data-array', `{"operation":"form","template":${empty},"data":[]}`],
    ['data-null', `{"operation":"bindForm","template":${empty},"data":null}`],
    ['buttons-data-array', `{"operation":"bindButtons","template":${bareTemplate},"data":[]}`],
    ['buttons-language-number', `{"operation":"bindButtons","template":${bareTemplate},"options":{"language":1}}`],
    ['buttons-template-kind', '{"operation":"bindButtons","template":{"kind":"x"}}'],
    ['actions-null', `{"operation":"form","template":${empty},"actions":null}`],
    ['actions-null-member', `{"operation":"form","template":${empty},"actions":[null]}`],
    ['action-shapes', `{"operation":"form","template":${named},"actions":[[],{"method":"render","args":[]},{"method":1,"args":[]},{"method":"getData"},{"method":"getData","args":{}},{"method":"getData","args":[]}]}`],
    ['option-values-null', `{"operation":"form","template":${named},"data":{},"options":{"language":null,"idPrefix":null,"keyPrefix":null,"unsupported":null}}`],
    ['compile-missing-file', '{"operation":"compileForm","spec":{"type":"group","properties":{"$ref":"missing.json"}}}'],
    ['action-failure-keeps-state', `{"operation":"form","template":${named},"data":{"name":"Ada"},"actions":[{"method":"setData","args":[[]]},{"method":"setValue","args":["name","Grace"]}]}`],
    ['row-actions', `{"operation":"form","template":${rows},"data":{"rows":{"row_a":"A","row_b":"B"}},"actions":[{"method":"addRow","args":["rows",{"key":"row_a"}]},{"method":"moveRow","args":["rows","row_b",0]},{"method":"rekeyRow","args":["rows","row_b","saved_row"]}]}`],
    ['row-actions-limit', `{"operation":"form","template":${limited},"data":{"rows":{"first":"kept"}},"actions":[{"method":"addRow","args":["rows",{"key":"second"}]},{"method":"copyRow","args":["rows","first"]},{"method":"getValue","args":["rows.first"]}]}`],
    ['bind-buttons-declared', `{"operation":"bindButtons","template":${buttons},"data":{"name":"a"},"options":{"language":"en"}}`],
    ['bind-buttons-default', `{"operation":"bindButtons","template":${empty}}`],
    ['buttons-html-declared', JSON.stringify({ operation: 'formButtonsHtml', buttons: evaluated })],
    ['buttons-html-missing', '{"operation":"formButtonsHtml"}'],
    ['buttons-html-null', '{"operation":"formButtonsHtml","buttons":null}'],
    ['buttons-html-number', '{"operation":"formButtonsHtml","buttons":1}'],
    ['buttons-html-member-list', '{"operation":"formButtonsHtml","buttons":[[]]}'],
    ['buttons-html-attribute-id', '{"operation":"formButtonsHtml","buttons":[{"tag":"a","text":"x","attrs":{"id":"i"}}]}'],
    ['buttons-html-attribute-href', '{"operation":"formButtonsHtml","buttons":[{"tag":"a","text":"x","attrs":{"href":1}}]}'],
    ...Object.entries({
      'spec-array': '"spec":[],"rows":[1]', 'spec-string': '"spec":"list"', 'rows-object': `"spec":${list},"rows":{}`,
      'rows-number': `"spec":${list},"rows":[1]`, 'rows-array': `"spec":${list},"rows":[[]]`,
      'context-array': `"spec":${list},"rows":[],"options":{"data":[]}`, 'context-string': `"spec":${list},"rows":[],"options":{"data":"s"}`,
      'context-before-page': `"spec":${list},"rows":[],"options":{"data":[],"page":0}`,
      'page-string': `"spec":${list},"rows":[],"options":{"page":"2"}`, 'page-array': `"spec":${list},"rows":[],"options":{"page":[]}`,
      'page-before-total': `"spec":${list},"rows":[],"options":{"page":0,"total":-1,"layout":"grid"}`,
      'page-fraction': `"spec":${list},"rows":[],"options":{"page":1.5}`, 'page-unsafe': `"spec":${list},"rows":[],"options":{"page":9007199254740992}`,
      'page-safe-total-negative-zero': `"spec":${list},"rows":[],"options":{"page":9007199254740991,"total":-0}`,
      'total-before-layout': `"spec":${list},"rows":[],"options":{"total":-1,"layout":"grid"}`,
      'total-fraction': `"spec":${list},"rows":[],"options":{"total":2.5}`, 'total-boolean': `"spec":${list},"rows":[],"options":{"total":true}`,
      'layout-unknown': `"spec":${list},"rows":[],"options":{"layout":"grid"}`, 'layout-number': `"spec":${list},"rows":[],"options":{"layout":5}`,
      'page-meta-array': `"spec":${list},"rows":[],"options":{"pageMeta":[]}`,
      'options-null-members': `"spec":${list},"rows":[{"v":"a"}],"options":{"data":null,"layout":null,"page":null,"total":null}`,
    }).map(([name, members]) => [`list-${name}`, `{"operation":"renderList",${members}}`]),
    ['detail-context-array', `{"operation":"renderDetail","spec":${detail},"record":{},"options":{"data":[]}}`],
    ['detail-context-string', `{"operation":"buildDetail","spec":${detail},"record":{},"options":{"data":"s"}}`],
    ['detail-context-null', `{"operation":"renderDetail","spec":${detail},"record":{},"options":{"data":null}}`],
    ['detail-fields-before-context', '{"operation":"buildDetail","spec":{},"record":{},"options":{"data":[]}}'],
    ['detail-record-array', `{"operation":"renderDetail","spec":${detail},"record":[]}`],
  ];
})();
const listCases = JSON.parse(await readFile(path.join(ROOT, 'tests/fixtures/list-render/cases.json'), 'utf8'));
const detailCases = JSON.parse(await readFile(path.join(ROOT, 'tests/fixtures/detail-render/cases.json'), 'utf8'));
assert.equal(formCases.length, 93, 'The form fixture inventory changed; review coverage before changing this assertion');
assert.equal(listCases.length, 58, 'The list fixture inventory changed; review coverage before changing this assertion');
assert.equal(detailCases.length, 31, 'The detail fixture inventory changed; review coverage before changing this assertion');

const targetNames = targets.map(target => target.name);
for (const name of selectedTargets) assert.ok(targetNames.includes(name), `Unknown target: ${name}; available targets are ${targetNames.join(', ')}`);
const runTargets = selectedTargets.length ? targets.filter(target => selectedTargets.includes(target.name)) : targets;
progress(`targets: ${runTargets.map(target => target.name).join(', ')}${checkPatterns.length ? `; checks matching ${checkPatterns.join(', ')}` : ''}`);

for (const target of runTargets) {
  const targetStart = Date.now();
  const status = { name: target.name, available: false, passed: false, command: target.command, args: target.args };
  report.targets.push(status);
  progress(`${target.name}: preparing`);
  const prepareBudget = PREPARE_BUDGET[target.name] ?? 120000;
  const controller = new AbortController();
  currentSignal = controller.signal;
  let prepareExpired;
  const prepareTimer = setTimeout(() => {
    prepareExpired = new Error(`preparation exceeded its ${prepareBudget} ms budget; the build was stopped`);
    controller.abort(prepareExpired);
  }, prepareBudget);
  const prepareRunning = setInterval(() => progress(`${target.name}: still preparing (${seconds(targetStart)} of ${prepareBudget / 1000}s)`), RUNNING_INTERVAL);
  const prepareExpiry = new Promise((resolve, reject) => controller.signal.addEventListener('abort', () => reject(prepareExpired), { once: true }));
  prepareExpiry.catch(() => {});
  try {
    await Promise.race([target.prepare(), prepareExpiry]);
    status.available = true;
    status.prepareMs = Date.now() - targetStart;
    progress(`${target.name}: prepared (${seconds(targetStart)})`);
  } catch (error) {
    const failure = prepareExpired ?? error;
    status.error = failure.message;
    process.stderr.write(`${target.name}: unavailable: ${failure.message}\n`);
    progress(`${target.name}: unavailable (${seconds(targetStart)})`);
    continue;
  } finally {
    clearTimeout(prepareTimer);
    clearInterval(prepareRunning);
    currentSignal = undefined;
  }

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
    // Server HTML is byte-identical: the form a target renders equals the reference bytes. A row
    // key the instance generates is random, so each distinct generated key becomes its position.
    const formRequest = { operation: 'form', template: expectedTemplate, data: (Object.hasOwn(fixture, 'data') ? fixture.data : {}), options: bindingOptions };
    const generatedKeys = html => {
      const positions = new Map();
      return html.replace(/__[0-9a-f]{13}__/g, key => `__generated-${positions.has(key) ? positions.get(key) : positions.set(key, positions.size).get(key)}__`);
    };
    const actualHtml = (await invoke(target, formRequest)).html;
    assert.equal(generatedKeys(actualHtml), generatedKeys(oracle(formRequest).html), 'Raw form HTML differs');
    // The form buttons of the record, as a model and as the footer markup built from that model.
    const buttonsRequest = { operation: 'bindButtons', template: expectedTemplate, data: formRequest.data, options: { language: bindingOptions.language ?? 'ko' } };
    const buttons = await invoke(target, buttonsRequest);
    equalOrdered(buttons, oracle(buttonsRequest), '$.buttons');
    const buttonsHtmlRequest = { operation: 'formButtonsHtml', buttons };
    assert.equal(await invoke(target, buttonsHtmlRequest), oracle(buttonsHtmlRequest), 'Raw button HTML differs');
    return { template: digest(actualTemplate), fields: digest(actualFields), html: digest(actualHtml), interoperability: true };
  }, { fixture: 'tests/fixtures/form-render/cases.json', case: fixture.name, model: ['compileForm', 'bindForm', 'bindButtons', 'formButtonsHtml'], html: ['renderForm'] });

  for (const fixture of [...listCases, imageCase, urlCase]) await check(target, `list:${fixture.name}`, async () => {
    const request = { operation: 'renderList', spec: fixture.spec, rows: fixture.rows ?? [], options: fixture.options ?? {} };
    let expected, expectedError;
    try { expected = oracle(request); } catch (error) { expectedError = errorRecord(error); }
    if (fixture.expectError) {
      assert.equal(expectedError?.code, fixture.expectError.code, 'JavaScript does not meet the declared fixture error code');
      if (fixture.expectError.message !== undefined) {
        assert.equal(expectedError?.message, fixture.expectError.message, 'JavaScript does not meet the declared fixture error message');
      }
    }
    let actual, actualError;
    try { actual = await invoke(target, request); } catch (error) { if (!(error instanceof OperationError)) throw error; actualError = error; }
    // The list model of the same input: the same members in the same order, or the same error.
    const modelRequest = { ...request, operation: 'buildList' };
    let expectedModel, expectedModelError, actualModel, actualModelError;
    try { expectedModel = oracle(modelRequest); } catch (error) { expectedModelError = errorRecord(error); }
    try { actualModel = await invoke(target, modelRequest); } catch (error) { if (!(error instanceof OperationError)) throw error; actualModelError = error; }
    if (expectedModelError) compareError(actualModelError, expectedModelError);
    else {
      assert.equal(actualModelError, undefined);
      equalOrdered(actualModel, expectedModel, '$.list');
    }
    if (expectedError) { compareError(actualError, expectedError); return { errorCode: actualError.code }; }
    assert.equal(actualError, undefined);
    assert.equal(actual, expected, 'Raw list HTML differs');
    if (fixture === imageCase) assert.ok(actual.startsWith('<link rel="preload" as="image" href="/b.png"/><link rel="preload" as="image" href="/a.png"/>'));
    if (fixture === urlCase) assert.ok(!actual.includes('alert(1)'), 'Ordinary URL contains the rejected script');
    return { html: digest(actual), model: digest(actualModel), rawHTML: true };
  }, listCases.includes(fixture) ? { fixture: 'tests/fixtures/list-render/cases.json', case: fixture.name, model: ['buildList'], html: ['renderList'] } : undefined);

  await check(target, 'build-list-model', async () => {
    const request = {
      operation: 'buildList',
      spec: {
        columns: {
          name: { field: 'name', label: 'Name', format: { type: 'link', href: '/users/{=jointablename.id}/{=join.join.name}.pdf' } },
          active: { field: 'active', format: { type: 'bool', as: 'check' } },
        },
        pagination: { per_page: 10, mode: 'offset' },
        sort: { field: 'name', dir: 'desc' },
        actions: { edit: { label: 'Edit', format: { type: 'link', href: '/edit' } } },
      },
      rows: [{ name: 'Ada', active: 1, jointablename: { id: 7 }, join: { join: { name: 'Ada' } } }],
      options: { language: 'en', page: 2, total: 5 },
    };
    const expected = oracle(request);
    const actual = await invoke(target, request);
    equalOrdered(actual, expected, '$.list');
    return { model: digest(actual) };
  });

  // Form button markup accepts evaluated buttons only, with the same error in every runtime.
  const button = { type: 'submit', tag: 'button', text: 'Save', attrs: { type: 'submit', class: 'crudui-action' } };
  for (const [name, buttons] of [
    ['object', {}], ['string', 'buttons'], ['null-button', [null]], ['array-button', [[]]],
    ['tag', [{ ...button, tag: 'div' }]], ['text', [{ ...button, text: 1 }]], ['attrs-array', [{ ...button, attrs: [] }]],
    ['attribute-name', [{ ...button, attrs: { onmouseover: 'x' } }]], ['attribute-value', [{ ...button, attrs: { class: 1 } }]],
  ]) await check(target, `reject-buttons:${name}`, async () => {
    const request = { operation: 'formButtonsHtml', buttons };
    let expected;
    try { oracle(request); } catch (error) { expected = errorRecord(error); }
    assert.ok(expected, 'JavaScript accepted invalid buttons');
    let actual;
    try { await invoke(target, request); } catch (error) { if (!(error instanceof OperationError)) throw error; actual = error; }
    compareError(actual, expected);
    return { errorCode: actual.code };
  });

  // The process boundary: every program answers the same standard input as the JavaScript
  // reference. Text that is not one JSON value fails with the same input error everywhere.
  for (const [name, text] of requestCases) await check(target, `request:${name}`, async () => {
    let request, parsed = true;
    try { request = JSON.parse(text); } catch { parsed = false; }
    let expected, expectedError;
    if (!parsed) expectedError = { code: 'INVALID_FORM_INPUT', message: 'Request must be valid JSON', at: '' };
    else try { expected = oracle(request); } catch (caught) { expectedError = errorRecord(caught); }
    const result = await execute(target.command, target.args, { input: text });
    assert.equal(result.stderr, '', 'The program wrote diagnostics');
    let actual, actualError;
    try { actual = parseCLIResponse(request !== null && typeof request === 'object' && !Array.isArray(request) ? request : {}, result); }
    catch (caught) { if (!(caught instanceof OperationError)) throw caught; actualError = caught; }
    if (expectedError) { compareError(actualError, expectedError); return { error: expectedError }; }
    assert.equal(actualError, undefined, `The request was rejected: ${actualError?.message}`);
    if (request.operation === 'bindForm') equalModels(actual, expected);
    else if (request.operation === 'form') {
      equalState(actual, expected);
      assert.equal(actual.steps.length, expected.steps.length);
      actual.steps.forEach((step, index) => {
        equalState(step, expected.steps[index]);
        equalOrdered(step.result, expected.steps[index].result, `steps[${index}].result`);
        if (expected.steps[index].error === null) assert.equal(step.error, null);
        else compareError(step.error, expected.steps[index].error);
      });
    } else equalOrdered(actual, expected, '$');
    return { digest: digest(actual) };
  });

  // The pagination model: member order and defaults for enabled, declared and disabled paging.
  for (const [name, pagination, options] of [
    ['enabled-defaults', true, {}],
    ['enabled-total', true, { page: 9, total: 41 }],
    ['declared-mode', { mode: 'cursor' }, { total: 0 }],
    ['declared-per-page', { per_page: 7 }, { page: 1 }],
    ['disabled-counts', false, { page: 3, total: 12 }],
    ['absent-counts', undefined, { total: 5 }],
  ]) await check(target, `list-pagination-model:${name}`, async () => {
    const spec = { columns: { name: { field: 'name', label: 'Name' } }, sort: { field: 'name', dir: 'asc' }, ...(pagination === undefined ? {} : { pagination }) };
    const request = { operation: 'buildList', spec, rows: [], options: { language: 'en', ...options } };
    const actual = await invoke(target, request);
    equalOrdered(actual.pagination, oracle(request).pagination, '$.pagination');
    return { pagination: digest(actual.pagination) };
  });

  // A detail is checked at both levels a runtime exposes: the model and its raw HTML.
  for (const fixture of detailCases) await check(target, `detail:${fixture.name}`, async () => {
    const evidence = {};
    for (const operation of ['buildDetail', 'renderDetail']) {
      const request = { operation, spec: fixture.spec, record: fixture.record ?? {}, options: fixture.options ?? {} };
      let expected, expectedError;
      try { expected = oracle(request); } catch (error) { expectedError = errorRecord(error); }
      if (fixture.expectError) {
        assert.equal(expectedError?.code, fixture.expectError.code, 'JavaScript does not meet the declared fixture error code');
        assert.equal(expectedError?.message, fixture.expectError.message, 'JavaScript does not meet the declared fixture error message');
      } else assert.equal(expectedError, undefined, 'JavaScript unexpectedly rejected a detail fixture');
      let actual, actualError;
      try { actual = await invoke(target, request); } catch (error) { if (!(error instanceof OperationError)) throw error; actualError = error; }
      if (expectedError) {
        compareError(actualError, expectedError);
        evidence[operation] = { errorCode: actualError.code };
        continue;
      }
      assert.equal(actualError, undefined);
      if (operation === 'buildDetail') equalOrdered(actual, expected, '$.detail');
      else assert.equal(actual, expected, 'Raw detail HTML differs');
      evidence[operation] = digest(actual);
    }
    return { model: evidence.buildDetail, html: evidence.renderDetail, rawHTML: true };
  }, { fixture: 'tests/fixtures/detail-render/cases.json', case: fixture.name, model: ['buildDetail'], html: ['renderDetail'] });

  for (const [index, item] of numberCases.entries()) await check(target, `number:${index}`, async () => {
    const format = { type: 'number' };
    if (Object.hasOwn(item, 'decimals')) format.decimals = item.decimals;
    const request = { operation: 'renderList', spec: { columns: { number: { field: 'number', format } } }, rows: [{ number: item.value }] };
    const expected = oracle(request), actual = await invoke(target, request);
    const cell = `<td class="crudui-list__cell crudui-value crudui-value--number">${item.expected}</td>`;
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
  }, { fixture: 'tests/native-generators/cases.mjs', case: scenario.name, model: ['createForm'] });

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
    ['multiple-unknown-key', { type: 'text', multiple: { min: 1, maximum: 3 } }, 'Invalid multiple.maximum at rows: unknown key'],
    ['multiple-unknown-before-value', { type: 'text', multiple: { min: 'x', foo: 1 } }, 'Invalid multiple.foo at rows: unknown key'],
    ['lang-unknown-key', { type: 'text', lang: { only: ['ko'], languages: ['en'] } }, 'Invalid lang.languages at rows: unknown key'],
    ['design-unknown-key', { type: 'text', design: { class: 'a', color: 'red' } }, 'Invalid design.color at rows: unknown key'],
    ['design-node-unknown-key', { type: 'text', design: { label: { class: 'a', text: 'Name' } } }, 'Invalid design.label.text at rows: unknown key'],
    ['behavior-unknown-key', { type: 'text', behavior: { onclick: 'go()', onsubmit: 'send()' } }, 'Invalid behavior.onsubmit at rows: unknown key'],
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
  // Member order: requests are sent as JSON text, so array-index member names arrive in the order they were written
  // (a JavaScript object would already hold them first). Order is judged where it survives parsing: arrays, HTML and messages.
  for (const [name, text] of memberOrderRequests) await check(target, `member-order:${name}`, async () => {
    const request = JSON.parse(text);
    let expected, expectedError;
    try { expected = oracle(request); } catch (caught) { expectedError = errorRecord(caught); }
    let actual, actualError;
    try {
      const result = await execute(target.command, target.args, { input: text, env: process.env });
      actual = parseCLIResponse(request, result);
    } catch (caught) { if (!(caught instanceof OperationError)) throw caught; actualError = caught; }
    if (expectedError) { compareError(actualError, expectedError); return { error: expectedError }; }
    assert.equal(actualError, undefined, 'A member order request was rejected');
    if (typeof expected === 'string') assert.equal(actual, expected, 'Member order HTML differs');
    else if (request.operation === 'bindForm') equalModels(actual, expected);
    else equalOrdered(actual, expected, '$');
    return { digest: digest(actual) };
  });
  const optionRejections = [
    ['language-number', { language: 5, keyPrefix: 5 }, 'Language must be a string'],
    ['key-prefix-number', { language: 'fr', keyPrefix: 5 }, 'keyPrefix must be a string'],
    ['id-prefix-array', { idPrefix: [] }, 'idPrefix must be a string'],
    ['unsupported-boolean', { unsupported: true }, 'unsupported must be throw or marker'],
    ['unsupported-other', { language: 'fr', unsupported: 'other' }, 'unsupported must be throw or marker'],
    ['language-unsupported', { language: 'fr', idPrefix: null }, 'Unsupported language: fr'],
  ];
  // The operation is the outer loop so each check group runs as one contiguous group.
  for (const operation of ['bindForm', 'form']) for (const [name, options, message] of optionRejections) await check(target, `${operation}-option-reject:${name}`, async () => {
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
  for (const operation of ['bindForm', 'form']) for (const [name, spec, data, message] of shapeRejections) await check(target, `${operation}-shape-reject:${name}`, async () => {
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
    const cells = [...html.matchAll(/<td class="crudui-list__cell crudui-value crudui-value--date">(.*?)<\/td>/g)].map(match => match[1]);
    assert.deepEqual(cells, dateCases.map(item => item.date === item.value && item.datetime === item.value ? item.value : item.datetime.replace('T', ' ')), 'List date values differ from explicit expectations');
    return { timezone, dateValues: dateCases.length, html: digest(html), fields: digest(initial.fields), rawHTML: true };
  });

  status.checks = report.checks.filter(check => check.target === target.name).length;
  status.failures = report.checks.filter(check => check.target === target.name && !check.passed).length;
  status.passed = status.failures === 0;
  status.durationMs = Date.now() - targetStart;
  progress(`${target.name}: ${status.checks - status.failures}/${status.checks} checks passed (${seconds(targetStart)})`);
}
progress('inputs: hashing sources and built artifacts again');
try {
  report.inputs.end = await inputManifest();
  assert.deepEqual(report.inputs.end, report.inputs.start, 'Source or runtime artifacts changed while the conformance suite was running');
  report.checks.push({ target: 'suite', case: 'unchanged-inputs', passed: true });
  progress('inputs: unchanged');
} catch (error) {
  report.checks.push({ target: 'suite', case: 'unchanged-inputs', passed: false, error: { message: error.message, expected: error.expected, actual: error.actual } });
  progress('inputs: CHANGED while the suite ran');
}
if (checkPatterns.length) {
  const matched = selectedCount > 0;
  report.checks.push({ target: 'suite', case: 'selected-checks', passed: matched, ...(matched ? { selected: selectedCount } : { error: { message: `No check matches ${checkPatterns.join(', ')}` } }) });
}
report.completed = true;
report.passed = report.targets.length === runTargets.length && report.targets.every(target => target.available && target.passed) && report.checks.every(check => check.passed);
report.summary = { passed: report.checks.filter(check => check.passed).length, failed: report.checks.filter(check => !check.passed).length, unavailable: report.targets.filter(target => !target.available).map(target => target.name) };
// A passing run removes its build directory; a failing run keeps it for inspection.
if (report.passed) {
  await rm(buildDirectory, { recursive: true, force: true });
  delete report.buildDirectory;
} else {
  process.stderr.write(`Build directory retained: ${buildDirectory}\n`);
}
if (reportPath) { await mkdir(path.dirname(reportPath), { recursive: true }); await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`); }
lines.close('native generators');
process.stdout.write(`${JSON.stringify(report.summary)}\n`);
if (!report.passed) process.exitCode = 1;
