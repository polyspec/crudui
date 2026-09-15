#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import YAML from 'yaml';

const repository = fileURLToPath(new URL('..', import.meta.url));
const at = (relative) => path.join(repository, relative);
const readText = (relative) => readFileSync(at(relative), 'utf8');
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const schema = read('../schema/crudui.schema.json');
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
assert.equal(ajv.validateSchema(schema), true, JSON.stringify(ajv.errors));
const entry = (definition) =>
  ajv.compile({ $schema: schema.$schema, definitions: schema.definitions, $ref: `#/definitions/${definition}` });
const validateForm = ajv.compile(schema);
const validateList = entry('List');
const validateDetail = entry('Detail');
// Composition files are validated as the fragment a `$ref` selects in them: a form
// field map, list columns or detail fields.
const validateProperties = entry('Properties');
const validateColumns = entry('Columns');
const validateDetailFields = entry('DetailFields');

let checked = 0;
for (const [multiple, expected] of [
  [{ min: 0, max: 3 }, true],
  [{ min: 'one' }, false],
  [{ copy: true, sortable: true }, true],
  [{ copy: {} }, false],
  [{ title: 'name', controls: 'outline', header: 'sticky' }, true],
  [{ controls: 'side' }, false],
  [{ header: 'fixed' }, false],
]) {
  const spec = { type: 'group', properties: { rows: { type: 'text', multiple } } };
  assert.equal(validateForm(spec), expected, `multiple: ${JSON.stringify(validateForm.errors)}`);
  checked++;
}
for (const [extra, expected] of [
  [{ buttons: [{ type: 'submit', name: '__submitted__', value: 'go', text: { ko: '저장', en: 'Save' }, design: { class: 'primary' } }] }, true],
  [{ buttons: [{ type: 'reset' }, { type: 'button', text: 'Cancel', behavior: { onclick: 'history.back()' } }] }, true],
  [{ buttons: [{ type: 'link', text: 'List', href: '../' }], action: { method: 'post', url: '/save' } }, true],
  [{ buttons: [{ type: 'image' }] }, false],
  [{ buttons: [{ type: 'button' }] }, false],
  [{ buttons: [{ type: 'link', text: 'List' }] }, false],
  [{ action: { target: '_blank' } }, false],
]) {
  const spec = { type: 'group', properties: { name: { type: 'text' } }, ...extra };
  assert.equal(validateForm(spec), expected, `buttons: ${JSON.stringify(extra)} ${JSON.stringify(validateForm.errors)}`);
  checked++;
}
// The structure-validity families share one case shape:
// { name, note, spec, files?, expect: "ok"|"fail", reason?, engine: "pass"|{ code, at } }.
// `expect` and `reason` are the meta-schema result for the family entry point.
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const caseKeys = new Set(['name', 'note', 'spec', 'files', 'expect', 'reason', 'engine']);
function assertValidityCase(family, test) {
  assert.ok(isObject(test), `${family}: every case is an object`);
  const label = `${family}:${test.name}`;
  for (const key of Object.keys(test)) assert.ok(caseKeys.has(key), `${label}: unknown member ${key}`);
  assert.equal(typeof test.name, 'string', `${label}: name is a string`);
  assert.equal(typeof test.note, 'string', `${label}: note is a string`);
  assert.ok(isObject(test.spec), `${label}: spec is an object`);
  if ('files' in test) assert.ok(isObject(test.files), `${label}: files is an object`);
  assert.ok(test.expect === 'ok' || test.expect === 'fail', `${label}: expect is "ok" or "fail"`);
  if (test.expect === 'fail') assert.equal(typeof test.reason, 'string', `${label}: a fail case names its reason`);
  else assert.ok(!('reason' in test), `${label}: only a fail case has a reason`);
  const engineShape =
    test.engine === 'pass' ||
    (isObject(test.engine) &&
      Object.keys(test.engine).sort().join() === 'at,code' &&
      typeof test.engine.code === 'string' &&
      typeof test.engine.at === 'string');
  assert.ok(engineShape, `${label}: engine is "pass" or { code, at }`);
}
for (const [family, validate] of [
  ['spec-validity', validateForm],
  ['list-validity', validateList],
  ['detail-validity', validateDetail],
]) {
  const cases = read(`../tests/fixtures/${family}/cases.json`);
  assert.ok(Array.isArray(cases) && cases.length > 0, `${family}: cases is a nonempty array`);
  assert.equal(new Set(cases.map((test) => test.name)).size, cases.length, `${family}: case names are unique`);
  for (const test of cases) {
    assertValidityCase(family, test);
    const label = `${family}:${test.name}`;
    assert.equal(validate(test.spec), test.expect === 'ok', `${label}: ${JSON.stringify(validate.errors)}`);
    if (test.expect === 'fail') {
      const keywords = validate.errors.map((error) => error.keyword);
      assert.ok(keywords.includes(test.reason), `${label}: expected ${test.reason} among ${JSON.stringify(keywords)}`);
    }
    checked++;
  }
}
for (const test of read('../tests/fixtures/translate/cases.json')) {
  assert.equal(validateForm(test.schema), true, `${test.name}: ${JSON.stringify(validateForm.errors)}`);
  checked++;
}

// ---------------------------------------------------------------------------
// Every specification meant to be valid passes the meta-schema.
//
// A case that expects an input or composition failure is not such a
// specification, so it is skipped. The specifications below are declared outside
// the schema on purpose: each one is asserted to FAIL, so the list cannot rot
// into a silent exemption.
// ---------------------------------------------------------------------------
const outsideSchema = new Map([
  [
    'detail-render:content-values',
    'content declared as numbers, objects and arrays. The declaration shape is text or a language map of strings; this case pins how every runtime resolves the other values to empty text (docs/spec/schema.md, Fields).',
  ],
  [
    'console:detail-edge-forbidden',
    'the forbidden meta key show_if, quoted from detail-validity red-show-if-on-field.',
  ],
  [
    'console:detail-edge-record',
    'a detail specification without fields, quoted from detail-render reject-record-before-fields.',
  ],
]);
const seenOutside = new Set();

/** Validate one specification that is meant to be valid, unless it is a declared exception. */
function checkSpec(label, spec, validate) {
  const reason = outsideSchema.get(label);
  if (reason) {
    seenOutside.add(label);
    assert.equal(validate(spec), false, `${label}: declared outside the schema (${reason}) but it passes`);
  } else {
    assert.equal(validate(spec), true, `${label}: ${JSON.stringify(validate.errors)}`);
  }
  checked++;
}

// A specification whose root is a bare composition entry is the properties-layer
// fragment `$ref` resolves (packages/validator-ts/src/compose/ref.ts), not a
// composed specification: the whole-spec entry requires `type`, which such a
// fragment supplies only after composition (tests/fixtures/spec-validity
// err-after-compose-ref-base-leak records that result).
const isCompositionEntry = (spec) =>
  spec !== null && typeof spec === 'object' && typeof spec.$ref === 'string' && !('type' in spec);

// Fixture families. `expectError` and `expectFailure` mark the input and
// composition failures the rule excludes.
for (const [family, member, validate] of [
  ['validate', 'spec', validateForm],
  ['form-render', 'spec', validateForm],
  ['form-outline', 'spec', validateForm],
  ['list-render', 'spec', validateList],
  ['detail-render', 'spec', validateDetail],
]) {
  const cases = read(`../tests/fixtures/${family}/cases.json`);
  assert.ok(Array.isArray(cases) && cases.length > 0, `${family}: cases is a nonempty array`);
  for (const test of cases) {
    if (test.expectError || test.expectFailure) continue;
    const spec = test[member];
    checkSpec(`${family}:${test.name}`, spec, isCompositionEntry(spec) ? validateProperties : validate);
  }
}

/** The fragment a `$ref` selects: `(file.yml).a.b` descends a, b and then `properties`. */
function refFragment(document, reference) {
  const match = /^\((?<path>.*?)\)\.(?<keys>.*)$/.exec(reference);
  const keys = match ? [...match.groups.keys.split('.'), 'properties'] : ['properties'];
  let node = document;
  for (const key of keys) {
    if (node === null || typeof node !== 'object' || !(key in node)) return undefined;
    node = node[key];
  }
  return node;
}

/** Every `$ref` in a declaration, with the child map definition its slot holds. */
function collectRefs(node, slot, found = []) {
  if (node === null || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, slot, found);
    return found;
  }
  if (typeof node.$ref === 'string') found.push({ reference: node.$ref, slot });
  for (const [key, value] of Object.entries(node)) {
    const next = key === 'columns' ? 'columns' : key === 'fields' ? 'fields' : key === 'search' ? 'properties' : slot;
    if (key !== '$patch') collectRefs(value, next, found);
  }
  return found;
}

const fragmentValidator = {
  properties: validateProperties,
  columns: validateColumns,
  fields: validateDetailFields,
};

/** Validate each composition file as the fragment the declaration selects in it. */
function checkFiles(label, declaration, files, slot) {
  if (!files) return;
  const references = collectRefs(declaration, slot);
  for (const [name, document] of Object.entries(files)) {
    for (const { reference, slot: kind } of references) {
      if (reference !== name && !reference.startsWith(`(${name})`)) continue;
      const fragment = refFragment(document, reference);
      if (fragment === undefined) continue;
      const validate = fragmentValidator[kind];
      assert.equal(
        validate(fragment),
        true,
        `${label}#${name}: the fragment ${reference} selects is not a valid ${kind} map: ${JSON.stringify(validate.errors)}`,
      );
      checked++;
    }
  }
}

for (const [family, slot] of [
  ['spec-validity', 'properties'],
  ['list-validity', 'properties'],
  ['detail-validity', 'fields'],
]) {
  for (const test of read(`../tests/fixtures/${family}/cases.json`)) {
    if (test.expect !== 'ok') continue;
    checkFiles(`${family}:${test.name}`, test.spec, test.files, slot);
  }
}
for (const test of read('../tests/fixtures/validate/cases.json')) {
  if (test.expectFailure) continue;
  checkFiles(`validate:${test.name}`, test.spec, test.files, 'properties');
}

// Composition entries are the fragment their kind names: a field map by default,
// a whole specification for `kind: "spec"`. `err-` cases expect a composition failure.
for (const test of read('../tests/fixtures/compose/cases.json')) {
  if (test.name.startsWith('err-') || test.expectError) continue;
  const { entry: declaration, files, kind } = test.input;
  const label = `compose:${test.name}`;
  checkSpec(label, declaration, kind === 'spec' ? validateForm : validateProperties);
  checkFiles(label, declaration, files, 'properties');
  for (const document of Object.values(files ?? {})) checkFiles(label, document, files, 'properties');
}

// Validator command-line requests that the runtime accepts.
for (const test of read('../tests/fixtures/validator-cli/cases.json')) {
  if (test.expected.exit !== 0) continue;
  let request;
  try {
    request = JSON.parse(test.input);
  } catch {
    continue;
  }
  const mode = request.mode ?? 'form';
  const validate = mode === 'list' ? validateList : mode === 'detail' ? validateDetail : validateForm;
  checkSpec(`validator-cli:${test.name}`, request.spec, validate);
}

// Browser form-session specifications.
for (const [file, exported] of [
  ['scenario.mjs', 'spec'],
  ['controls.mjs', 'controlSpec'],
]) {
  const module = await import(pathToFileURL(at(`tests/fixtures/form-session/${file}`)));
  checkSpec(`form-session:${file}`, module[exported], validateForm);
}

// ---------------------------------------------------------------------------
// Example specifications.
// ---------------------------------------------------------------------------
checkSpec('examples/form-structure', YAML.parse(readText('examples/form-structure/spec.yml')), validateForm);

// The console client is a browser module, so it is loaded by its source rather
// than by path: the nearest package.json does not declare a module type.
const consoleSource = readText('examples/cross-check-console/client/examples.js');
const console_ = await import(
  `data:text/javascript;base64,${Buffer.from(consoleSource).toString('base64')}`
);
for (const [list, validate] of [
  [console_.examples, validateForm],
  [console_.listExamples, validateList],
  [console_.detailExamples, validateDetail],
]) {
  assert.ok(list.length > 0, 'the cross-check console declares examples');
  for (const example of list) checkSpec(`console:${example.id}`, YAML.parse(example.spec), validate);
}

/** The JSON object that starts at `open` in `source`, by brace matching. */
function jsonObjectAt(source, open) {
  let depth = 0;
  let quoted = false;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '\\') index += 1;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) return JSON.parse(source.slice(open, index + 1));
  }
  throw new Error('unterminated object');
}

/** The example specifications each package example embeds in its source. */
const packageExamples = [
  ['packages/generator-go/examples/server/main.go', /^const (?<name>\w+) = `(?<spec>\{.*\})`$/gm, (match) => [match.groups.name, JSON.parse(match.groups.spec)]],
  ['packages/generator-php/examples/index.php', /\$(?<name>\w+) = json_decode\(<<<'JSON'\n(?<spec>\{.*\})\nJSON,/g, (match) => [match.groups.name, JSON.parse(match.groups.spec)]],
  ['packages/generator-rust/examples/form.rs', /let (?<name>\w*spec) = json!\(/g, (match, source) => [match.groups.name, jsonObjectAt(source, source.indexOf('{', match.index))]],
];
const packageEntry = {
  specification: validateForm,
  listSpecification: validateList,
  detailSpecification: validateDetail,
  spec: validateForm,
  listSpec: validateList,
  detailSpec: validateDetail,
  list_spec: validateList,
  detail_spec: validateDetail,
};
for (const [file, pattern, extract] of packageExamples) {
  const source = readText(file);
  let found = 0;
  for (const match of source.matchAll(pattern)) {
    const [name, spec] = extract(match, source);
    const validate = packageEntry[name];
    assert.ok(validate, `${file}: ${name} is not a known form, list or detail specification`);
    checkSpec(`${file}:${name}`, spec, validate);
    found += 1;
  }
  assert.equal(found, 3, `${file}: expected the form, list and detail specifications, found ${found}`);
}

// ---------------------------------------------------------------------------
// Legacy corpora. `examples/legacy` and `tests/fixtures/specs` declare the
// legacy field model (docs/spec/legacy-schema.md), which the current validator
// does not convert: rules under `rules`, messages beside them, and visibility in
// `display_switch`/`display_target`. The current meta-schema rejects that model
// by design, so these files are checked as legacy: they must parse under the
// unique-key rule, and they must not pass the current meta-schema.
// ---------------------------------------------------------------------------
function yamlFiles(directory) {
  const found = [];
  for (const name of readdirSync(at(directory)).sort()) {
    if (name === 'node_modules' || name === 'vendor' || name === 'target' || name.startsWith('.')) continue;
    const relative = `${directory}/${name}`;
    if (statSync(at(relative)).isDirectory()) found.push(...yamlFiles(relative));
    else if (/\.ya?ml$/.test(name) && name !== 'docker-compose.yml') found.push(relative);
  }
  return found;
}
const legacyMarker = /(^|\n)\s*(rules|messages|display_switch|display_target|wrapper_class|group_class):/;
for (const file of [...yamlFiles('examples/legacy'), ...yamlFiles('tests/fixtures/specs')]) {
  const source = readText(file);
  const document = YAML.parse(source); // Throws on a duplicate key.
  assert.ok(legacyMarker.test(source), `${file}: has no legacy field model marker; move it out of the legacy corpora`);
  assert.equal(validateForm(document), false, `${file}: passes the current meta-schema, so it is no longer legacy`);
  checked++;
}

const unused = [...outsideSchema.keys()].filter((label) => !seenOutside.has(label));
assert.deepEqual(unused, [], `declared outside the schema but never reached: ${unused.join(', ')}`);

process.stdout.write(`[schema] form, list and detail schema compiled; ${checked} specification checks passed\n`);
