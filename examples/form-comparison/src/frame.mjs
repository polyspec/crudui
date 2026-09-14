import { mountView } from '#adapter';
import { formValidation } from './form-validation.mjs';
import { bindFormController } from './bind-form-controller.mjs';
import { specFor } from './scenario.mjs';
import { translations } from '../public/text.mjs';
import { encodeJson, readJson } from './json.mjs';
import { formInitializations } from './runtime-paths.mjs';
import { domSnapshot, identical } from '../../../tests/form-inspector/form-snapshot.mjs';
import { serverGeneration } from './server-generation.mjs';
import { createActionCompletion } from './action-completion.mjs';

const renderingPath = __FORM_PATH__;
const framework = __FRAMEWORK__;
const server = new URLSearchParams(location.search).get('server') ?? 'php';
if (!['php', 'php-ext', 'go', 'rust'].includes(server)) throw new Error('Unknown server');
const language = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'ko';
const initialization = new URLSearchParams(location.search).get('initialization');
if (!formInitializations.includes(initialization)) throw new Error('Unknown initialization path');
const t = translations(language);
const form = document.querySelector('#form');
const view = document.querySelector('#view');
const transport = document.querySelector('#transport');
const spec = specFor();
const generation = serverGeneration(server, renderingPath, framework);
let driver;
let validation;
let running = false;
const actionCompletion = createActionCompletion();

for (const id of ['create', 'load', 'blank', 'save', 'validate', 'reset', 'nonsequential', 'checks']) document.querySelector(`#${id}`).textContent = t[id];
for (const id of ['results', 'names', 'state', 'server-data']) document.querySelector(`#${id}-label`).textContent = t[id];
document.querySelector('#transport-label').textContent = t.transportLabel;
for (const option of transport.options) option.textContent = t[`${option.value}Transport`];
document.querySelector('#revision').textContent = `${t[`${initialization}Initialization`]} · ${t[renderingPath]} · ${t.serverNames[server]} · ${framework}`;
document.querySelector('#commit').textContent = __SOURCE_COMMIT__;
document.querySelector('#method').textContent = t[renderingPath + 'Note'];
document.querySelector('#save-note').textContent = t.saveNote;
document.documentElement.lang = language;
document.documentElement.dataset.language = language;

function collectionRows(container) {
  // Rows of this collection, not rows of collections nested inside them.
  return Array.from(container?.querySelectorAll('[data-crudui-row-key]') ?? [])
    .filter(row => row.parentElement.closest('[data-field-path]') === container);
}
function collection(parent, field) {
  const attribute = 'data-field-path';
  const suffix = field;
  return Array.from(parent.querySelectorAll(`[${attribute}]`))
    .find(element => {
      const path = element.getAttribute(attribute);
      return path === suffix || path.endsWith(`.${suffix}`);
    });
}
const companies = () => collectionRows(collection(view, 'companies'));
const stores = company => collectionRows(collection(company, 'stores'));
const departments = store => collectionRows(collection(store, 'departments'));
const companyName = row => Array.from(row.querySelectorAll('input[name]')).find(el => /^form\[companies\]\[[^\]]+\]\[name\]$/.test(el.name));
const storeName = row => Array.from(row.querySelectorAll('input[name]')).find(el => /^form\[companies\]\[[^\]]+\]\[stores\]\[[^\]]+\]\[name\]$/.test(el.name));
function rowButton(row, action) {
  return Array.from(row.querySelectorAll(`[data-crudui-action="${action}"]`)).find(button => button.closest('[data-crudui-row-key]') === row);
}
function assert(condition, message) { if (!condition) throw new Error(message); }
function equal(actual, expected, label) { assert(actual === expected, `${label}: expected ${expected}, actual ${actual}`); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function same(actual, expected, label) { equal(JSON.stringify(canonical(actual)), JSON.stringify(canonical(expected)), label); }
async function settle() { await driver?.idle?.(); }
async function click(row, action) { rowButton(row, action).click(); await settle(); }
async function edit(input, value) {
  input.focus(); input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
}
function inspect() {
  document.querySelector('#names').textContent = JSON.stringify(Array.from(new FormData(form)), null, 2);
  const data = driver?.getData();
  document.querySelector('#state').textContent = JSON.stringify(data ?? {}, null, 2);
  document.querySelector('#count').textContent = `${t.count}: ${companies().length}`;
}
async function request(action, body, json = false) {
  const response = await fetch(`/api/${server}/${action}/${renderingPath}/${framework}`, {
    method: action === 'load' ? 'GET' : 'POST',
    ...(body ? { body: json ? encodeJson({ form: body }) : body } : {}),
    ...(json ? { headers: { 'Content-Type': 'application/json' } } : {}),
  });
  const result = await readJson(response);
  document.querySelector('#server-data').textContent = JSON.stringify({ status: response.status, ...result }, null, 2);
  return { status: response.status, ...result };
}
function nativeData(data) {
  const fields = new FormData();
  function append(value, name) {
    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) append(child, `${name}[${key}]`);
    } else fields.append(name, value == null ? '' : String(value));
  }
  append(data, 'form');
  fields.append('_form_complete', '1');
  return fields;
}
const submitData = data => transport.value === 'json'
  ? request('save', data, true) : request('save', nativeData(data));
async function load() {
  const result = await request('load');
  equal(result.status, 200, 'load status');
  validation?.clear();
  await driver.load(result.data); await settle(); inspect();
  return result;
}
async function mount(data = {}, formSpec = spec) {
  validation?.clear();
  const compiled = await generation.prepare(formSpec, { keyPrefix: 'form' });
  if (driver) await driver.dispose();
  view.replaceChildren();
  driver = renderingPath === 'bindForm'
    ? bindFormController(view, mountView, compiled.template, language, data)
    : mountView(view, compiled.template, language, data);
  Object.assign(driver, {
    generator: compiled.generator,
    referenceReads: () => compiled.referenceReads,
    compileRequests: generation.compileRequests,
  });
  validation = formValidation(view, document.querySelector('#validation'), formSpec, t);
  await settle(); inspect();
}
/**
 * Parsed DOM of the rendered form (every element, attribute and text in child order;
 * attribute order has no meaning in the DOM) without the nodes frameworks use as rendering
 * anchors, which render nothing: comments and empty text.
 */
function renderedFormDom() {
  const rendered = view.querySelector('.crudui-form');
  assert(rendered, 'A rendered form must exist');
  const copy = rendered.cloneNode(true);
  const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT);
  const anchors = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.COMMENT_NODE || node.nodeValue === '') anchors.push(node);
  }
  for (const node of anchors) node.remove();
  // A style attribute is a CSS declaration block: compare its declarations as the CSS object
  // model serializes them, as React writes `name: value;` for the markup's `name:value`.
  for (const element of [copy, ...copy.querySelectorAll('[style]')]) {
    if (element.style.cssText === '') element.removeAttribute('style');
    else element.setAttribute('style', element.style.cssText);
  }
  return JSON.stringify(domSnapshot(copy));
}
/**
 * SSR: the selected server renders the form with the record, and the framework takes that
 * form over with the same template and data. Taking it over must not change the form DOM.
 */
async function serverRender(data) {
  const compiled = await generation.prepare(spec, { keyPrefix: 'form' });
  const response = await fetch(`/api/${server}/render/${renderingPath}/${framework}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: encodeJson({ template: compiled.template, data, options: { language } }),
  });
  const rendered = await readJson(response);
  equal(response.status, 200, 'server render status');
  if (driver) await driver.dispose();
  driver = undefined;
  view.innerHTML = rendered.html;
  const serverDom = renderedFormDom();
  await mount(rendered.data);
  identical(renderedFormDom(), serverDom, 'framework takeover of the server-rendered form');
}
async function reset(fixture = 'populated') {
  const result = await request('reset', new URLSearchParams({ fixture }));
  equal(result.status, 200, 'reset status');
  await mount(result.data);
  return result;
}
async function submit(action = 'validate', method = transport.value) {
  if (method === 'json') return request(action, driver.getData(), true);
  const fields = new FormData(form);
  fields.append('_form_complete', '1');
  return request(action, fields);
}
async function save() {
  await settle();
  const checked = validation.validate(driver.getData());
  if (!checked.valid) return { status: null, validation: checked };
  const result = await submit('save');
  equal(result.status, 200, result.error ?? 'save status');
  equal(result.validation.valid, true, 'save validation');
  if (driver.session) {
    for (const change of result.keyChanges) driver.session.rekeyRow(change.path, change.oldKey, change.newKey);
  } else await driver.rekeyRows(result.keyChanges);
  await settle(); inspect();
  return result;
}
function storageRows(storage) {
  return { companies: storage.companies, stores: storage.stores, departments: storage.departments };
}
function assertOwnership(storage) {
  const companyIds = new Set(storage.companies.map(row => row.company_seq));
  const storeIds = new Set(storage.stores.map(row => row.store_seq));
  equal(companyIds.size, storage.companies.length, 'unique company IDs');
  equal(storeIds.size, storage.stores.length, 'unique store IDs');
  equal(new Set(storage.departments.map(row => row.department_seq)).size, storage.departments.length, 'unique department IDs');
  for (const row of storage.stores) assert(companyIds.has(row.company_seq), 'Store parent must exist');
  for (const row of storage.departments) assert(storeIds.has(row.store_seq), 'Department parent must exist');
}

const checks = [
  ['identity', async () => {
    equal(view.querySelectorAll('input[type=hidden]').length, 0, 'hidden identity controls');
    assert(!Array.from(new FormData(form).keys()).some(name => /\[(?:company|store|department)_seq\]$/.test(name)), 'Sequences must be encoded in row keys, without additional fields');
  }],
  ['render', async () => {
    equal(companies().length, 1, 'company rows');
    equal(stores(companies()[0]).length, 2, 'store rows');
    equal(departments(stores(companies()[0])[0]).length, 1, 'department rows');
    equal(storeName(stores(companies()[0])[0]).value, 'Seoul', 'store name');
    equal(storeName(stores(companies()[0])[0]).name,
      'form[companies][__0000000000001__][stores][__0000000000001__][name]',
      'native name');
  }],
  ['plus', async () => {
    await click(companies()[0], 'add-row');
    equal(companies().length, 2, 'company rows after plus');
    equal(companyName(companies()[0]).value, 'Company A', 'existing company');
    equal(companyName(companies()[1]).value, '', 'new company');
    equal(stores(companies()[1]).length, 1, 'new nested store');
    equal(departments(stores(companies()[1])[0]).length, 1, 'new nested department');
    await edit(storeName(stores(companies()[1])[0]), 'New store');
    equal(storeName(stores(companies()[0])[0]).value, 'Seoul', 'existing store');
    assert(/^form\[companies\]\[__[a-f0-9]{13}__\]\[stores\]\[__[a-f0-9]{13}__\]\[name\]$/.test(
      storeName(stores(companies()[1])[0]).name), 'new keyed name');
  }],
  ['copy', async () => {
    await edit(companyName(companies()[0]), 'Edited company');
    await edit(storeName(stores(companies()[0])[0]), 'Edited store');
    await click(companies()[0], 'copy-row');
    equal(companies().length, 2, 'company rows after copy');
    equal(companyName(companies()[1]).value, 'Edited company', 'copied company');
    equal(stores(companies()[1]).length, 2, 'copied stores');
    equal(storeName(stores(companies()[1])[0]).value, 'Edited store', 'copied current store');
    assert(storeName(stores(companies()[1])[0]).name !== storeName(stores(companies()[0])[0]).name, 'Descendant paths must be independent');
    assert(stores(companies()[0])[0].dataset.cruduiRowKey !== stores(companies()[1])[0].dataset.cruduiRowKey,
      'Copied store key must change');
    assert(departments(stores(companies()[0])[0])[0].dataset.cruduiRowKey
      !== departments(stores(companies()[1])[0])[0].dataset.cruduiRowKey,
    'Copied department key must change');
    await edit(storeName(stores(companies()[1])[0]), 'Independent copy');
    equal(storeName(stores(companies()[0])[0]).value, 'Edited store', 'existing row after copy edit');
    await click(companies()[1], 'remove-row');
    equal(companies().length, 1, 'company rows after removal');
  }],
  ['order', async () => {
    await click(companies()[0], 'copy-row');
    equal(companies().length, 2, 'company rows before ordering');
    await edit(companyName(companies()[1]), 'Moved company');
    await click(companies()[1], 'move-up');
    equal(companyName(companies()[0]).value, 'Moved company', 'first company');
    equal(companyName(companies()[1]).value, 'Company A', 'second company');
    equal(storeName(stores(companies()[0])[0]).value, 'Seoul', 'moved descendant');
  }],
  ['inject', async () => {
    await edit(companyName(companies()[0]), 'Dirty value');
    await load();
    equal(companyName(companies()[0]).value, 'Company A', 'reloaded input');
  }],
  ['transport', async () => {
    await click(stores(companies()[0])[1], 'move-up');
    equal(storeName(stores(companies()[0])[0]).value, 'Busan', 'first store before submission');
    const saved = await save();
    same(saved.storage.stores.map(row => row.name), ['Busan', 'Seoul'], 'selected transport order');
    const json = await request('save', driver.getData(), true);
    equal(json.status, 200, 'JSON submission with preserved member order');
    same(json.storage.stores.map(row => row.name), ['Busan', 'Seoul'], 'JSON document order');
    await load();
    equal(storeName(stores(companies()[0])[0]).value, 'Busan', 'first reloaded store');
    equal(storeName(stores(companies()[0])[1]).value, 'Seoul', 'second reloaded store');
    const editedDocument = canonical(driver.getData());
    const changed = await request('save', editedDocument, true);
    equal(changed.status, 200, 'edited JSON document status');
    same(changed.storage.stores.map(row => row.name), ['Seoul', 'Busan'],
      'edited document order determines row order');
    await load();
    same(stores(companies()[0]).map(row => storeName(row).value), ['Seoul', 'Busan'],
      'rendered order after JSON document edit');
  }],
  ['nonsequential', async () => {
    await reset('nonsequential');
    same(companies().map(row => companyName(row).value), ['Company 5', 'Company 7', 'Company 1'], 'loaded sequence order');
    same(companies().map(row => row.dataset.cruduiRowKey),
      ['__0000000000005__', '__0000000000007__', '__0000000000001__'],
      'keys are identities, not positions');
    const json = await request('save', driver.getData(), true);
    equal(json.status, 200, 'nonsequential JSON document status');
    same(json.storage.companies.map(row => row.company_seq), ['5', '7', '1'],
      'JSON document preserves nonsequential IDs');
    await load();
    same(companies().map(row => companyName(row).value),
      ['Company 5', 'Company 7', 'Company 1'], 'reloaded JSON document order');
    await click(companies()[1], 'add-row');
    equal(companies().length, 4, 'inserted company count');
    equal(companyName(companies()[3]).value, 'Company 1', 'company after inserted row');
    assert(/^__[a-f0-9]{13}__$/.test(companies()[2].dataset.cruduiRowKey),
      'new company key format');
    assert(!['__0000000000005__', '__0000000000007__', '__0000000000001__']
      .includes(companies()[2].dataset.cruduiRowKey), 'new company key must be independent');
    await edit(companyName(companies()[2]), 'Company 8');
    await edit(storeName(stores(companies()[2])[0]), 'Store 8');
    const added = await save();
    same(added.storage.companies.map(row => row.company_seq), ['5', '7', '8', '1'], 'saved inserted ID and order');
    equal(added.storage.stores.find(row => row.name === 'Store 8').company_seq, '8', 'new store parent');
    equal(storeName(stores(companies()[2])[0]).name,
      'form[companies][__0000000000008__][stores][__0000000000008__][name]',
      'saved descendant path');
    await load();
    same(companies().map(row => companyName(row).value), ['Company 5', 'Company 7', 'Company 8', 'Company 1'], 'reloaded inserted order');
    await click(companies()[2], 'remove-row'); await save();
    await click(companies()[1], 'copy-row');
    await edit(companyName(companies()[2]), 'Copied company 7');
    const copied = await save();
    same(copied.storage.companies.map(row => row.company_seq), ['5', '7', '9', '1'], 'copied ID and order');
    equal(copied.storage.stores.find(row => row.company_seq === '9').store_seq, '9', 'copied store ID');
    equal(copied.storage.departments.find(row => row.store_seq === '9').department_seq, '9', 'copied department ID');
    equal(storeName(stores(companies()[1])[0]).value, 'Store 7', 'original store after scoped copy and saved keys');
    for (let index = 3; index > 0; index--) await click(companies()[index], 'move-up');
    const reordered = await save();
    same(reordered.storage.companies.map(row => row.company_seq), ['1', '5', '7', '9'], 'stored moved order');
    same(reordered.storage.companies.map(row => row.position), [0, 1, 2, 3], 'positions are independent of IDs');
    assertOwnership(reordered.storage);
    await load();
    same(companies().map(row => companyName(row).value), ['Company 1', 'Company 5', 'Company 7', 'Copied company 7'], 'reloaded moved order');
  }],
  ['saved', async () => {
    await click(companies()[0], 'copy-row');
    equal(companies().length, 2, 'copied company before save');
    await edit(companyName(companies()[1]), 'Saved copy');
    await edit(storeName(stores(companies()[1])[0]), 'Saved child');
    const result = await save();
    equal(result.storage.companies.length, 2, 'stored companies');
    equal(result.storage.stores.length, 4, 'stored stores');
    equal(result.storage.companies[0].company_seq, '1', 'existing company ID');
    equal(result.storage.companies[1].company_seq, '2', 'new company ID');
    equal(result.storage.stores.find(row => row.name === 'Saved child').company_seq, '2', 'saved child parent');
    assertOwnership(result.storage);
    equal(storeName(stores(companies()[1])[0]).name,
      'form[companies][__0000000000002__][stores][__0000000000003__][name]',
      'rekeyed nested input');
    const reloaded = await load();
    same(reloaded.storage, result.storage, 'stored data on subsequent GET');
    equal(companyName(companies()[1]).value, 'Saved copy', 'reloaded company');
    equal(storeName(stores(companies()[1])[0]).value, 'Saved child', 'reloaded child');
    const second = await save();
    same(second.storage, result.storage, 'second save must retain IDs and records');
  }],
  ['serverValid', async () => {
    const result = await submit();
    equal(result.status, 200, 'server status');
    equal(result.validatorSource, 'current', 'current server validator');
    equal(result.validation.valid, true, 'server validation');
    equal(result.transport, transport.value === 'json' ? 'application/json' : 'multipart/form-data', 'selected submission content type');
    equal(result.jsonProcessor, 'ordered-json', 'server JSON processor');
    equal(result.server, server, 'selected server implementation');
    equal(Object.values(Object.values(result.received.companies)[0].stores)[0].name, 'Seoul', 'server nested name');
  }],
  ['serverInvalid', async () => {
    const before = await request('load');
    await edit(storeName(stores(companies()[0])[0]), '');
    const data = driver.getData();
    const client = validation.validate(data);
    equal(client.valid, false, 'JS required validation');
    const stopped = await save();
    equal(stopped.status, null, 'invalid save stops before transmission');
    const result = await submit('save');
    equal(result.status, 422, 'invalid save status');
    same(client, result.validation, 'JS and server validation results');
    const hiddenSpec = structuredClone(spec);
    hiddenSpec.properties.companies.properties.stores.properties.name.design = { show: false };
    await mount(data, hiddenSpec);
    equal(storeName(stores(companies()[0])[0]).closest('[data-field-path]').hidden, true, 'required field is hidden by design');
    const hiddenClient = validation.validate(driver.getData());
    same(hiddenClient, client, 'hiding required input does not change validation');
    equal((await save()).status, null, 'hidden required input blocks browser submission');
    const hiddenServer = await submit('save');
    equal(hiddenServer.status, 422, 'hidden required input fails on server');
    same(hiddenServer.validation, client, 'server ignores display when validating');
    equal(result.validation.valid, false, 'server required validation');
    assert(result.validation.errors.some(error => String(error.path).endsWith('.name') && error.rule === 'required'), 'Expected required error at store name');
    same((await request('load')).storage, before.storage, 'stored data after invalid save');
  }],
  ['exact', async () => {
    await reset('default');
    const before = await request('load');
    const saved = await save();
    same(storageRows(saved.storage), storageRows(before.storage), 'complete round trip');
    const loaded = await load();
    same(loaded.data, before.data, 'complete loaded form data');
    const parsed = await submit();
    same(parsed.normalized, before.data, 'normalized data after reload');
  }],
  ['empty', async () => {
    await reset('default');
    const empty = {};
    async function addEmpty(wrapper) {
      equal(collectionRows(wrapper).length, 0, 'empty collection row count');
      equal(wrapper.querySelectorAll('input[name],textarea[name],select[name]').length, 0, 'empty collection has no submitted row controls');
      assert(!wrapper.hidden, 'Empty collection remains visible');
      // The collection's own Add button: no row between it and the collection
      // (the collection itself may sit inside an enclosing row).
      const button = Array.from(wrapper.querySelectorAll('[data-crudui-action="add-row"]'))
        .find(item => {
          const row = item.closest('[data-crudui-row-key]');
          return item.closest('[data-field-path]') === wrapper && !(row && wrapper.contains(row));
        });
      assert(button, 'Empty collection must have an Add button');
      button.focus({ preventScroll: true });
      button.click(); await settle();
      equal(collectionRows(wrapper).length, 1, 'add into empty collection');
      const created = Array.from(collectionRows(wrapper)[0].querySelectorAll('input:not([type=hidden]),select,textarea'))
        .find(control => !control.disabled && !control.closest('[hidden]'));
      assert(created && document.activeElement === created, 'Empty addition focuses the first input of the new row');
    }
    const departmentName = row => row.querySelector('input[name$="[name]"]');
    equal(departments(stores(companies()[0])[1]).length, 0, 'empty departments');
    const initial = await request('load');
    const displaySpec = structuredClone(spec);
    displaySpec.properties.companies.properties.stores.properties.departments.design = { show: '.enabled' };
    await mount(initial.data, displaySpec);
    const template = driver.template;
    const serialized = JSON.stringify(template);
    const departmentWrapper = () => collection(stores(companies()[0])[1], 'departments');
    equal(departmentWrapper().hidden, true, 'hidden empty collection');
    equal(departments(stores(companies()[0])[1]).length, 0, 'hidden empty row count');
    stores(companies()[0])[1].querySelector('input[type=checkbox]').click(); await settle();
    assert(!departmentWrapper().hidden, 'Empty collection becomes visible');
    equal(departments(stores(companies()[0])[1]).length, 0, 'showing does not add data');
    stores(companies()[0])[1].querySelector('input[type=checkbox]').click(); await settle();
    equal(departmentWrapper().hidden, true, 'empty collection hides again');
    equal(driver.template, template, 'visibility reuses the same template');
    equal(JSON.stringify(template), serialized, 'visibility preserves template content');
    await mount(initial.data);
    const before = initial.storage;
    await addEmpty(collection(stores(companies()[0])[1], 'departments'));
    equal(companies().length, 1, 'nested addition preserves company count');
    equal(stores(companies()[0]).length, 2, 'nested addition preserves store count');
    // Department names are optional in the spec; a created blank row is valid.
    const blank = await save();
    equal(blank.status, 200, 'optional blank department is valid');
    const created = blank.storage.departments.find(row => row.store_seq === '2');
    equal(created.name, '', 'optional blank value is stored unchanged');
    same(blank.storage.companies, before.companies, 'unchanged company IDs');
    same(blank.storage.stores, before.stores, 'unchanged sibling stores');
    same(blank.storage.departments.filter(row => row.store_seq === '1'), before.departments, 'unchanged sibling departments');
    await load(); equal(departments(stores(companies()[0])[1]).length, 1, 'reloaded blank department');
    await click(departments(stores(companies()[0])[1])[0], 'remove-row');
    const removed = await save();
    equal(removed.storage.departments.length, 1, 'last department removal');
    await load(); equal(departments(stores(companies()[0])[1]).length, 0, 'reloaded empty department collection');
    await addEmpty(collection(stores(companies()[0])[1], 'departments'));
    await edit(departmentName(departments(stores(companies()[0])[1])[0]), 'Support');
    const restored = await save();
    assert(restored.storage.departments.find(row => row.name === 'Support').department_seq !== created.department_seq, 'Deleted department ID must not be reused');
    assertOwnership(restored.storage);
    await load(); equal(departmentName(departments(stores(companies()[0])[1])[0]).value, 'Support', 'recreated department reload');

    while (stores(companies()[0]).length) await click(stores(companies()[0])[0], 'remove-row');
    const noStores = await save();
    equal(noStores.storage.companies.length, 1, 'company remains after store deletion');
    equal(noStores.storage.stores.length, 0, 'stored empty stores');
    equal(noStores.storage.departments.length, 0, 'removed store descendants');
    await load(); equal(stores(companies()[0]).length, 0, 'reloaded empty stores');
    await addEmpty(collection(companies()[0], 'stores'));
    await edit(storeName(stores(companies()[0])[0]), 'New store');
    const newStore = await save();
    equal(newStore.status, 200, 'new store save');
    equal(newStore.storage.stores[0].company_seq, before.companies[0].company_seq, 'existing parent ID retained');
    await load(); equal(storeName(stores(companies()[0])[0]).value, 'New store', 'new store reload');

    await click(companies()[0], 'remove-row');
    equal(companies().length, 0, 'last company removal');
    const saved = await save();
    for (const table of ['companies', 'stores', 'departments']) equal(saved.storage[table].length, 0, `stored empty ${table}`);
    await load(); equal(companies().length, 0, 'reloaded empty companies');
    const json = await request('save', { companies: empty }, true);
    equal(json.status, 200, 'explicit empty JSON save');
    same(json.data, { companies: empty }, 'explicit empty JSON data');
    await load(); equal(companies().length, 0, 'JSON empty reload');
    await addEmpty(collection(view, 'companies'));
    await edit(companyName(companies()[0]), 'New company');
    await edit(storeName(stores(companies()[0])[0]), 'New child');
    const rebuilt = await save();
    equal(rebuilt.status, 200, 'recreated hierarchy save');
    assertOwnership(rebuilt.storage);
    assert(rebuilt.storage.companies[0].company_seq !== before.companies[0].company_seq, 'Deleted company ID must not be reused');
    await load();
    equal(companyName(companies()[0]).value, 'New company', 'recreated company reload');
    equal(storeName(stores(companies()[0])[0]).value, 'New child', 'recreated child reload');
  }],
  ['deletion', async () => {
    await click(companies()[0], 'copy-row');
    equal(companies().length, 2, 'copied company');
    await edit(companyName(companies()[1]), 'First company');
    await save();
    await click(companies()[1], 'move-up');
    const reordered = await save();
    equal(reordered.storage.companies[0].company_seq, '2', 'persisted first ID');
    await load(); equal(companyName(companies()[0]).value, 'First company', 'persisted order');
    await click(companies()[1], 'remove-row');
    const deleted = await save();
    equal(deleted.storage.companies.length, 1, 'remaining company');
    assert(deleted.storage.stores.every(row => row.company_seq === '2'), 'Deleted company stores must be removed');
    assert(deleted.storage.stores.every(row => !['1', '2'].includes(row.store_seq)), 'Old store IDs must be removed');
    assertOwnership(deleted.storage);
    await load(); equal(companies().length, 1, 'reloaded remaining company');
  }],
  ['shape', async () => {
    const before = await request('load');
    equal((await request('save', { companies: [] }, true)).status, 400,
      'wrong empty collection type');
    equal((await submitData({ companies: null })).status, 400, 'invalid collection value');
    equal((await submitData({ companies: { __abcdef0123456__: { name: '' } } })).status,
      422, 'empty row requires a company name');
    const invalidField = structuredClone(before.data);
    const invalidStore = Object.values(Object.values(invalidField.companies)[0].stores)[0];
    invalidStore.enabled = '2';
    equal((await submitData(invalidField)).status, 400, 'invalid checkbox value');
    invalidStore.enabled = '1'; invalidStore.title = ['invalid'];
    equal((await submitData(invalidField)).status, 400, 'language array instead of object');
    const malformed = new FormData();
    malformed.append('form[companies][0][name]', 'Invalid collection');
    malformed.append('_form_complete', '1');
    equal((await request('save', malformed)).status, 400, 'wrong native collection type');
    const oversized = { companies: {} };
    for (let index = 0; index < 5; index++) {
      const row = { name: `Company ${index}`, stores: {} };
      oversized.companies[`__${String(index).padStart(13, 'a')}__`] = row;
    }
    equal((await submitData(oversized)).status, 422, 'server maximum company count');
    const truncated = new FormData();
    for (let index = 0; index < 10001; index++) truncated.append(`extra${index}`, 'x');
    truncated.append('_form_complete', '1');
    equal((await request('save', truncated)).status, 400, 'truncated native form');
    const bad = structuredClone(before.data);
    const child = structuredClone(Object.values(bad.companies)[0]);
    bad.companies.__abcdef0123456__ = child;
    equal((await submitData(bad)).status, 400, 'existing child under different parent');
    equal((await request('save', new FormData())).status, 400, 'incomplete native form');
    same((await request('load')).storage, before.storage, 'records after rejected structures');
  }],
  ['equivalence', async () => {
    await reset('nonsequential');
    await click(companies()[1], 'copy-row');
    await edit(companyName(companies()[2]), 'Equivalent copy');
    await click(companies()[3], 'move-up');
    const data = driver.getData();
    const native = await submit('save', 'form');
    equal(native.status, 200, 'native save status');
    equal(native.transport, 'multipart/form-data', 'native request type');
    await request('reset', new URLSearchParams({ fixture: 'nonsequential' }));
    const json = await request('save', data, true);
    equal(json.status, 200, 'JSON save status');
    equal(json.transport, 'application/json', 'JSON request type');
    equal(json.jsonProcessor, 'ordered-json', 'ordered server processing');
    same(json.storage, native.storage, 'identical records, IDs, parents and positions');
    same(json.keyChanges, native.keyChanges, 'identical saved-key changes');
    equal(encodeJson(json.data), encodeJson(native.data), 'identical loaded values, types and row order');
    assertOwnership(json.storage);
    const loaded = await load();
    equal(encodeJson(loaded.data), encodeJson(json.data), 'fresh GET preserves JSON save');
    same(companies().map(row => companyName(row).value), json.storage.companies.map(row => row.name), 'rendered saved order');
  }],
  ['jsonSyntax', async () => {
    const before = await request('load');
    for (const [body, type, status] of [
      ['{"form":{},}', 'application/json', 400],
      [new Uint8Array([0x22, 0xff, 0x22]), 'application/json', 400],
      ['{"form":[]}', 'application/json', 400],
      ['{"form":{"companies":null}}', 'application/json', 400],
      ['{"form":{},"number":9007199254740993}', 'application/json', 400],
      ['{}', 'text/plain', 415],
    ]) {
      const response = await fetch(`/api/${server}/save/${renderingPath}/${framework}`, {
        method: 'POST', headers: { 'Content-Type': type }, body,
      });
      const result = await readJson(response);
      equal(response.status, status, 'invalid JSON request status');
      assert(typeof result.error === 'string', 'JSON error response');
    }
    same((await request('load')).storage, before.storage, 'JSON rejection leaves storage unchanged');
  }],
  ['keyedNames', async () => {
    const keyedData = { companies: Object.fromEntries(['5', '7', '1'].map(seq => {
      const key = `__${seq.padStart(13, '0')}__`;
      return [key, { name: `Company ${seq}`, stores: { [key]: {
        name: `Store ${seq}`, enabled: '1', detail: `Notes ${seq}`, title: { ko: seq, en: seq },
        departments: { [key]: { name: `Department ${seq}` } },
      } } }];
    })) };
    const keyedSpec = specFor();
    await mount({}, keyedSpec);
    await driver.load(keyedData); await settle();
    equal(view.querySelectorAll('input[type=hidden]').length, 0, 'keyed input uses no hidden sequence fields');
    equal(storeName(stores(companies()[0])[0]).name, 'form[companies][__0000000000005__][stores][__0000000000005__][name]', 'keyed name from the selected renderer');
    const fields = new FormData(form); fields.append('_form_complete', '1');
    const response = await fetch(
      `/api/${server}/validate/${renderingPath}/${framework}`, { method: 'POST', body: fields });
    const result = await readJson(response);
    equal(response.status, 200, 'server status for keyed names');
    equal(result.validatorSource, 'current', 'current validator source');
    equal(result.validation.valid, true, 'server validation of keyed names');
    same(result.normalized, keyedData, 'keyed native values without hidden sequence fields');
    same(Object.keys(result.normalized.companies), Object.keys(keyedData.companies), 'native keyed document order');
  }],
  ['cache', async () => {
    assert(driver.template && driver.referenceReads, 'This example adapter does not prepare a cached structure');
    let compileRequests;
    if (['go', 'rust'].includes(server)) {
      equal(driver.referenceReads(), 1, 'server compiler reference reads');
    } else equal(driver.referenceReads(), null,
      'unavailable server compiler reference instrumentation');
    compileRequests = driver.compileRequests();
    assert(Number.isSafeInteger(compileRequests) && compileRequests > 0,
      'HTTP compile request count must be a positive safe integer');
    const before = JSON.stringify(driver.template);
    const source = (await load()).data;
    await edit(companyName(companies()[0]), 'Cache isolation check');
    await load();
    equal(companyName(companies()[0]).value, 'Company A', 'cached structure receives fresh data');
    equal(driver.compileRequests(), compileRequests,
      'HTTP compile requests after data injection and editing');
    const fetchBeforeBlock = globalThis.fetch;
    globalThis.fetch = (input, options) => {
      if (new URL(input, location.href).pathname.includes('/compile/')) {
        throw new Error('Compile route is blocked after template preparation');
      }
      return fetchBeforeBlock(input, options);
    };
    try {
      await mount();
      await driver.load(source);
      await settle();
    } finally { globalThis.fetch = fetchBeforeBlock; }
    equal(driver.compileRequests(), compileRequests,
      'HTTP compile requests after repeated mounting');
    equal(companyName(companies()[0]).value, 'Company A',
      'cached template creates and injects a new instance while compilation is blocked');
    equal(JSON.stringify(driver.template), before, 'template after load');
    assert(!before.includes('Company A'), 'Template must exclude record values');
    assert(driver.fromSerializedTemplate, 'Binding must use a template restored from JSON');
  }],
];

async function runChecks(method = transport.value, only) {
  if (running) throw new Error('Checks already running');
  delete window.comparison?.lastReport;
  running = true;
  transport.value = method;
  transport.disabled = true;
  const results = [];
  const output = document.querySelector('#results');
  output.replaceChildren();
  try {
    for (const [id, test] of checks) {
      if (only && id !== only) continue;
      let error;
      try { await reset(); await test(); } catch (e) { error = e.message; }
      const item = { id, passed: !error, ...(error ? { error } : {}) };
      results.push(item);
      const line = document.createElement('div');
      line.className = error ? 'fail' : 'pass';
      const status = document.createElement('p'); status.textContent = `${error ? t.fail : t.pass} · ${t[id]}`;
      line.append(status);
      if (error) {
        const detail = document.createElement('details');
        const summary = document.createElement('summary'); summary.textContent = t.failureDetails;
        const raw = document.createElement('pre'); raw.textContent = error;
        detail.append(summary, raw); line.append(detail);
      }
      output.append(line);
    }
    await reset();
    const report = {
      kind: 'scenario', server, path: renderingPath, framework, transport: method,
      commit: __SOURCE_COMMIT__, results,
    };
    window.comparison.lastReport = report;
    return report;
  } finally { running = false; transport.disabled = false; }
}
function action(id, fn) {
  document.querySelector(`#${id}`).addEventListener('click', async () => {
    const tracked = actionCompletion.begin(id);
    if (running) {
      tracked?.fail(new Error('Checks already running'));
      return;
    }
    try {
      const result = await fn();
      await settle();
      inspect();
      tracked?.complete(result);
    } catch (error) {
      document.querySelector('#results').textContent = error.message;
      tracked?.fail(error);
    }
  });
}
action('load', load);
action('create', async () => { const result = await request('load'); equal(result.status, 200, 'load status'); await mount(result.data); });
action('blank', () => mount());
action('save', async () => { const result = await save(); if (result.status !== null) document.querySelector('#server-data-details').open = true; });
action('validate', async () => { if (validation.validate(driver.getData()).valid) { await submit(); document.querySelector('#server-data-details').open = true; } });
action('reset', () => reset());
action('nonsequential', () => reset('nonsequential'));
action('checks', runChecks);
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (running) return;
  try { await save(); }
  catch (error) { document.querySelector('#results').textContent = error.message; }
});
for (const name of ['input', 'change', 'click']) view.addEventListener(name, async () => { await settle(); inspect(); });
async function inject(data) {
  validation?.clear();
  await driver.load(data); await settle(); inspect();
}
// Initialization comparison: both columns run these stages in turn against a reset repository.
let stageSource;
let stageTemplate;
let randomCounter = 0;
const randomDescriptor = Object.getOwnPropertyDescriptor(crypto, 'getRandomValues');
const systemRandom = crypto.getRandomValues.bind(crypto);
/** Repeat the 7-byte row key inputs so both columns create the same row keys. */
function repeatableRandom(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 7) return systemRandom(bytes);
  const seed = randomCounter++;
  for (let index = 0; index < bytes.length; index++) bytes[index] = (171 + seed * 17 + index * 29) % 256;
  return bytes;
}
function endInitialization() {
  if (randomDescriptor) Object.defineProperty(crypto, 'getRandomValues', randomDescriptor);
  else delete crypto.getRandomValues;
}
function focusState() {
  const active = document.activeElement;
  return view.contains(active) ? {
    name: active.getAttribute('name'), class: active.getAttribute('class'),
    row: active.closest('[data-crudui-row-key]')?.getAttribute('data-crudui-row-key') ?? null,
    start: active.selectionStart ?? null, end: active.selectionEnd ?? null,
    direction: active.selectionDirection ?? null,
  } : null;
}
/** Run one initialization stage and return the server response of a save stage. */
async function initializationStage(stage) {
  let response;
  switch (stage) {
    case 'mounted':
      endInitialization();
      stageSource = (await request('reset', new URLSearchParams({ fixture: 'populated' }))).data;
      if (initialization === 'ssr') await serverRender(stageSource);
      else {
        await mount();
        assert(view.querySelector('input[name]'), 'A form must exist before record injection');
        await driver.load(stageSource);
      }
      stageTemplate = JSON.stringify(driver.template);
      break;
    case 'reinjected-1':
    case 'reinjected-2':
      await driver.load(stageSource);
      identical(JSON.stringify(driver.template), stageTemplate, 'cached template');
      break;
    case 'data-hidden': {
      const changed = structuredClone(stageSource);
      Object.values(Object.values(changed.companies)[0].stores)[0].enabled = '';
      await driver.load(changed);
      break;
    }
    case 'data-restored':
    case 'restored':
      await driver.load(stageSource);
      break;
    case 'edited':
      await edit(companyName(companies()[0]), 'Initialization company');
      await edit(storeName(stores(companies()[0])[0]), 'Initialization store');
      await edit(stores(companies()[0])[0].querySelector('textarea'), 'Initialization notes');
      stores(companies()[0])[0].querySelector('input[type=checkbox]').click();
      break;
    case 'saved':
    case 'saved-new': {
      const saved = await save();
      equal(saved.status, 200, `${stage} status`);
      if (stage === 'saved-new') endInitialization();
      response = { validation: saved.validation, records: storageRows(saved.storage), keyChanges: saved.keyChanges };
      break;
    }
    case 'reloaded':
      await load();
      break;
    case 'copied':
      randomCounter = 0;
      crypto.getRandomValues = repeatableRandom;
      await click(companies()[0], 'copy-row');
      break;
    case 'moved':
      await click(companies()[1], 'move-up');
      break;
    case 'copy-removed':
      await click(companies()[0], 'remove-row');
      break;
    case 'added':
      await click(companies()[0], 'add-row');
      await edit(companyName(companies()[1]), 'Added company');
      await edit(storeName(stores(companies()[1])[0]), 'Added store');
      break;
    case 'collapsed-all':
    case 'expanded-all':
    case 'undone': {
      const action = { 'collapsed-all': 'collapse-all', 'expanded-all': 'expand-all', undone: 'undo' }[stage];
      const button = view.querySelector(`[data-crudui-action="${action}"]`);
      assert(button && !button.disabled, `The structure map ${action} button must be enabled`);
      button.focus();
      button.click();
      break;
    }
    case 'empty':
      await driver.load({ companies: {} });
      break;
    default:
      throw new Error(`Unknown initialization stage: ${stage}`);
  }
  await settle(); inspect();
  return response;
}
if (initialization === 'ssr') {
  const result = await request('load');
  equal(result.status, 200, 'load status');
  await serverRender(result.data);
} else {
  await mount();
  await load();
}
window.comparison = {
  runChecks, reset, inspect, submit, save, load, inject, idle: settle, server,
  initializationStage, endInitialization, focusState,
  encodedData: () => encodeJson(driver.getData()),
  nextAction: actionCompletion.next, cancelAction: actionCompletion.cancel,
  actionCompletion: actionCompletion.completion,
  path: renderingPath, framework, initialization,
  commit: __SOURCE_COMMIT__,
};
window.parent.postMessage({
  type: 'crudui:frame-ready', server, framework, path: renderingPath, initialization,
}, location.origin);
