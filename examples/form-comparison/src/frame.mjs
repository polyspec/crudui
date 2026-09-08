import { mountView } from '#adapter';
import { formValidation } from './form-validation.mjs';
import { originalController } from './original-controller.mjs';
import { specFor } from './scenario.mjs';
import { translations } from '../public/text.mjs';
import { encodeJson, readJson } from './json.mjs';
import { formSnapshot, styleSnapshot, compareSnapshots, identical, snapshotHash } from './form-snapshot.mjs';
import { appendInitializationEvidence } from './initialization-report.mjs';

const mode = __FORM_MODE__;
const framework = __FRAMEWORK__;
const keyed = mode !== 'original';
const server = new URLSearchParams(location.search).get('server') ?? 'php';
if (!['php', 'go', 'rust'].includes(server)) throw new Error('Unknown server');
const language = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'ko';
const t = translations(language);
const form = document.querySelector('#form');
const view = document.querySelector('#view');
const transport = document.querySelector('#transport');
const flush = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const spec = specFor(mode);
let driver;
let validation;
let running = false;
let initializationEvidence;

for (const id of ['create', 'load', 'blank', 'save', 'validate', 'reset', 'nonsequential', 'checks', 'initialization-check']) document.querySelector(`#${id}`).textContent = t[id];
for (const id of ['results', 'names', 'state', 'server-data']) document.querySelector(`#${id}-label`).textContent = t[id];
document.querySelector('#transport-label').textContent = t.transportLabel;
for (const option of transport.options) option.textContent = t[`${option.value}Transport`];
document.querySelector('#revision').textContent = `${t[mode]} · ${t.serverNames[server]} · ${framework}`;
document.querySelector('#commit').textContent = __SOURCE_COMMIT__;
document.querySelector('#method').textContent = t[mode === 'original' ? 'originalNote' : mode === 'original-keyed' ? 'originalKeyedNote' : mode === 'corrected' ? 'correctedNote' : 'keyedNote'];
document.querySelector('#save-note').textContent = t.saveNote;
document.documentElement.lang = language;
document.documentElement.dataset.language = language;

function collectionRows(container) {
  const body = Array.from(container?.children ?? []).find(el => el.classList.contains('form-element'));
  return Array.from(body?.children ?? []).filter(el => el.matches('.input-group-wrapper[data-uniqid]'));
}
function collection(parent, field) {
  const attribute = mode === 'keyed' ? 'data-field-path' : 'name';
  const suffix = mode === 'keyed' ? field : `${field}-layer`;
  return Array.from(parent.querySelectorAll(`.form-element-wrapper[${attribute}]`))
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
  return Array.from(row.querySelectorAll(`button.btn-${action}`)).find(button => button.closest('.input-group-wrapper[data-uniqid]') === row);
}
function assert(condition, message) { if (!condition) throw new Error(message); }
function equal(actual, expected, label) { assert(actual === expected, `${label}: expected ${expected}, actual ${actual}`); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function same(actual, expected, label) { equal(JSON.stringify(canonical(actual)), JSON.stringify(canonical(expected)), label); }
async function settle() { await driver?.idle?.(); await flush(); }
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
  const response = await fetch(`/api/${server}/${action}/${mode}/${framework}`, {
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
  if (driver) await driver.dispose();
  view.replaceChildren();
  driver = mode !== 'keyed' ? originalController(view, mountView, formSpec, language, keyed, data) : mountView(view, formSpec, language, data);
  validation = formValidation(view, document.querySelector('#validation'), formSpec, t);
  await settle(); inspect();
}
async function reset(fixture = keyed ? 'populated' : 'default') {
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
  } else if (keyed) await driver.rekeyRows(result.keyChanges);
  else await driver.load(result.data);
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
    equal(storeName(stores(companies()[0])[0]).name, mode === 'original'
      ? 'form[companies][0][stores][0][name]'
      : 'form[companies][__0000000000001__][stores][__0000000000001__][name]', 'native name');
  }],
  ['plus', async () => {
    await click(companies()[0], 'plus');
    equal(companies().length, 2, 'company rows after plus');
    equal(companyName(companies()[0]).value, 'Company A', 'original company');
    equal(companyName(companies()[1]).value, '', 'new company');
    equal(stores(companies()[1]).length, 1, 'new nested store');
    equal(departments(stores(companies()[1])[0]).length, 1, 'new nested department');
    await edit(storeName(stores(companies()[1])[0]), 'New store');
    equal(storeName(stores(companies()[0])[0]).value, 'Seoul', 'original store');
    if (mode === 'original') equal(storeName(stores(companies()[1])[0]).name, 'form[companies][1][stores][0][name]', 'new array name');
  }],
  ['copy', async () => {
    await edit(companyName(companies()[0]), 'Edited company');
    await edit(storeName(stores(companies()[0])[0]), 'Edited store');
    await click(companies()[0], 'copy');
    equal(companies().length, 2, 'company rows after copy');
    equal(companyName(companies()[1]).value, 'Edited company', 'copied company');
    equal(stores(companies()[1]).length, 2, 'copied stores');
    equal(storeName(stores(companies()[1])[0]).value, 'Edited store', 'copied current store');
    assert(storeName(stores(companies()[1])[0]).name !== storeName(stores(companies()[0])[0]).name, 'Descendant paths must be independent');
    if (mode === 'original') {
      assert(Array.from(companies()[1].querySelectorAll('input[type=hidden]')).every(input => input.value === ''), 'Copied sequences must be empty');
      assert(!Array.from(new FormData(form).keys()).some(name => /__[a-f0-9]{13}__/.test(name)), 'Array names must exclude 13-character keys');
    } else {
      assert(stores(companies()[0])[0].dataset.uniqid !== stores(companies()[1])[0].dataset.uniqid, 'Copied store key must change');
      assert(departments(stores(companies()[0])[0])[0].dataset.uniqid !== departments(stores(companies()[1])[0])[0].dataset.uniqid, 'Copied department key must change');
    }
    await edit(storeName(stores(companies()[1])[0]), 'Independent copy');
    equal(storeName(stores(companies()[0])[0]).value, 'Edited store', 'original after copy edit');
    await click(companies()[1], 'minus');
    equal(companies().length, 1, 'company rows after removal');
  }],
  ['order', async () => {
    await click(companies()[0], 'copy');
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
    if (keyed) {
      const saved = await save();
      same(saved.storage.stores.map(row => row.name), ['Busan', 'Seoul'], 'selected transport order');
      const json = await request('save', driver.getData(), true);
      equal(json.status, 200, 'JSON submission with preserved member order');
      same(json.storage.stores.map(row => row.name), ['Busan', 'Seoul'], 'JSON document order');
    } else {
      equal((await request('save', canonical(driver.getData()), true)).status, 200, 'array JSON save status');
    }
    await load();
    equal(storeName(stores(companies()[0])[0]).value, 'Busan', 'first reloaded store');
    equal(storeName(stores(companies()[0])[1]).value, 'Seoul', 'second reloaded store');
    if (keyed) {
      const editedDocument = canonical(driver.getData());
      const changed = await request('save', editedDocument, true);
      equal(changed.status, 200, 'edited JSON document status');
      same(changed.storage.stores.map(row => row.name), ['Seoul', 'Busan'], 'edited document order determines row order');
      await load();
      same(stores(companies()[0]).map(row => storeName(row).value), ['Seoul', 'Busan'], 'rendered order after JSON document edit');
    }
  }],
  ['nonsequential', async () => {
    await reset('nonsequential');
    same(companies().map(row => companyName(row).value), ['Company 5', 'Company 7', 'Company 1'], 'loaded sequence order');
    if (keyed) same(companies().map(row => row.dataset.uniqid), ['__0000000000005__', '__0000000000007__', '__0000000000001__'], 'keys are identities, not positions');
    if (keyed) {
      const json = await request('save', driver.getData(), true);
      equal(json.status, 200, 'nonsequential JSON document status');
      same(json.storage.companies.map(row => row.company_seq), ['5', '7', '1'], 'JSON document preserves nonsequential IDs');
      await load();
      same(companies().map(row => companyName(row).value), ['Company 5', 'Company 7', 'Company 1'], 'reloaded JSON document order');
    }
    await click(companies()[1], 'plus');
    equal(companies().length, 4, 'inserted company count');
    equal(companyName(companies()[3]).value, 'Company 1', 'company after inserted row');
    if (keyed) {
      assert(/^__[a-f0-9]{13}__$/.test(companies()[2].dataset.uniqid), 'new company key format');
      assert(!['__0000000000005__', '__0000000000007__', '__0000000000001__'].includes(companies()[2].dataset.uniqid), 'new company key must be independent');
    }
    await edit(companyName(companies()[2]), 'Company 8');
    await edit(storeName(stores(companies()[2])[0]), 'Store 8');
    const added = await save();
    same(added.storage.companies.map(row => row.company_seq), ['5', '7', '8', '1'], 'saved inserted ID and order');
    equal(added.storage.stores.find(row => row.name === 'Store 8').company_seq, '8', 'new store parent');
    if (keyed) equal(storeName(stores(companies()[2])[0]).name, 'form[companies][__0000000000008__][stores][__0000000000008__][name]', 'saved descendant path');
    await load();
    same(companies().map(row => companyName(row).value), ['Company 5', 'Company 7', 'Company 8', 'Company 1'], 'reloaded inserted order');
    await click(companies()[2], 'minus'); await save();
    await click(companies()[1], 'copy');
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
    await click(companies()[0], 'copy');
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
    if (keyed) equal(storeName(stores(companies()[1])[0]).name, 'form[companies][__0000000000002__][stores][__0000000000003__][name]', 'rekeyed nested input');
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
    equal(result.validatorSource, ['corrected', 'keyed'].includes(mode) ? mode : 'original', 'matching server validator revision');
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
    equal(storeName(stores(companies()[0])[0]).closest('.form-element-wrapper').style.display, 'none', 'required field is hidden by design');
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
    const empty = mode === 'original' ? [] : {};
    async function addEmpty(wrapper) {
      equal(collectionRows(wrapper).length, 0, 'empty collection row count');
      equal(wrapper.querySelectorAll('input[name],textarea[name],select[name]').length, 0, 'empty collection has no submitted row controls');
      assert(wrapper.style.display !== 'none', 'Empty collection remains visible');
      const button = wrapper.querySelector(':scope > .form-element > button.btn-plus');
      assert(button, 'Empty collection must have an Add button');
      button.focus({ preventScroll: true });
      button.click(); await settle();
      equal(collectionRows(wrapper).length, 1, 'add into empty collection');
      assert(document.activeElement.matches('button.btn-plus'), 'Empty addition retains button focus');
      equal(document.activeElement.closest('.form-element-wrapper'), wrapper, 'Focused button belongs to the same collection');
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
    equal(departmentWrapper().style.display, 'none', 'hidden empty collection');
    equal(departments(stores(companies()[0])[1]).length, 0, 'hidden empty row count');
    stores(companies()[0])[1].querySelector('input[type=checkbox]').click(); await settle();
    assert(departmentWrapper().style.display !== 'none', 'Empty collection becomes visible');
    equal(departments(stores(companies()[0])[1]).length, 0, 'showing does not add data');
    stores(companies()[0])[1].querySelector('input[type=checkbox]').click(); await settle();
    equal(departmentWrapper().style.display, 'none', 'empty collection hides again');
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
    await click(departments(stores(companies()[0])[1])[0], 'minus');
    const removed = await save();
    equal(removed.storage.departments.length, 1, 'last department removal');
    await load(); equal(departments(stores(companies()[0])[1]).length, 0, 'reloaded empty department collection');
    await addEmpty(collection(stores(companies()[0])[1], 'departments'));
    await edit(departmentName(departments(stores(companies()[0])[1])[0]), 'Support');
    const restored = await save();
    assert(restored.storage.departments.find(row => row.name === 'Support').department_seq !== created.department_seq, 'Deleted department ID must not be reused');
    assertOwnership(restored.storage);
    await load(); equal(departmentName(departments(stores(companies()[0])[1])[0]).value, 'Support', 'recreated department reload');

    while (stores(companies()[0]).length) await click(stores(companies()[0])[0], 'minus');
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

    await click(companies()[0], 'minus');
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
    await click(companies()[0], 'copy');
    equal(companies().length, 2, 'copied company');
    await edit(companyName(companies()[1]), 'First company');
    await save();
    await click(companies()[1], 'move-up');
    const reordered = await save();
    equal(reordered.storage.companies[0].company_seq, '2', 'persisted first ID');
    await load(); equal(companyName(companies()[0]).value, 'First company', 'persisted order');
    await click(companies()[1], 'minus');
    const deleted = await save();
    equal(deleted.storage.companies.length, 1, 'remaining company');
    assert(deleted.storage.stores.every(row => row.company_seq === '2'), 'Deleted company stores must be removed');
    assert(deleted.storage.stores.every(row => !['1', '2'].includes(row.store_seq)), 'Old store IDs must be removed');
    assertOwnership(deleted.storage);
    await load(); equal(companies().length, 1, 'reloaded remaining company');
  }],
  ['shape', async () => {
    const before = await request('load');
    if (mode === 'original') equal((await request('save', { companies: {} }, true)).status, 400, 'wrong empty collection type');
    equal((await submitData({ companies: null })).status, 400, 'invalid collection value');
    equal((await submitData({ companies: mode === 'original' ? [{ name: '' }] : { __abcdef0123456__: { name: '' } } })).status, 422, 'empty row requires a company name');
    const invalidField = structuredClone(before.data);
    const invalidStore = Object.values(Object.values(invalidField.companies)[0].stores)[0];
    invalidStore.enabled = '2';
    equal((await submitData(invalidField)).status, 400, 'invalid checkbox value');
    invalidStore.enabled = '1'; invalidStore.title = ['invalid'];
    equal((await submitData(invalidField)).status, 400, 'language array instead of object');
    const malformed = new FormData();
    malformed.append(`form[companies][${mode === 'original' ? 'bad' : '0'}][name]`, 'Invalid collection');
    malformed.append('_form_complete', '1');
    equal((await request('save', malformed)).status, 400, 'wrong native collection type');
    const oversized = { companies: mode === 'original' ? [] : {} };
    for (let index = 0; index < 5; index++) {
      const row = { name: `Company ${index}`, stores: mode === 'original' ? [] : {} };
      if (mode === 'original') oversized.companies.push(row);
      else oversized.companies[`__${String(index).padStart(13, 'a')}__`] = row;
    }
    equal((await submitData(oversized)).status, 422, 'server maximum company count');
    const truncated = new FormData();
    for (let index = 0; index < 10001; index++) truncated.append(`extra${index}`, 'x');
    truncated.append('_form_complete', '1');
    equal((await request('save', truncated)).status, 400, 'truncated native form');
    const bad = structuredClone(before.data);
    const child = structuredClone(Object.values(bad.companies)[0]);
    if (mode === 'original') { child.company_seq = ''; bad.companies.push(child); }
    else bad.companies.__abcdef0123456__ = child;
    equal((await submitData(bad)).status, 400, 'existing child under different parent');
    equal((await request('save', new FormData())).status, 400, 'incomplete native form');
    same((await request('load')).storage, before.storage, 'records after rejected structures');
  }],
  ['equivalence', async () => {
    await reset('nonsequential');
    await click(companies()[1], 'copy');
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
      const response = await fetch(`/api/${server}/save/${mode}/${framework}`, {
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
    if (driver) await driver.dispose();
    view.replaceChildren();
    const keyedSpec = specFor('keyed');
    driver = mode !== 'keyed' ? originalController(view, mountView, keyedSpec, language, true) : mountView(view, keyedSpec, language);
    await driver.load(keyedData); await settle();
    equal(view.querySelectorAll('input[type=hidden]').length, 0, 'keyed input uses no hidden sequence fields');
    equal(storeName(stores(companies()[0])[0]).name, 'form[companies][__0000000000005__][stores][__0000000000005__][name]', 'keyed name from the selected renderer');
    const fields = new FormData(form); fields.append('_form_complete', '1');
    const response = await fetch(`/api/${server}/validate/${mode === 'original' ? 'original-keyed' : mode}/${framework}`, { method: 'POST', body: fields });
    const result = await readJson(response);
    equal(response.status, 200, 'server status for keyed names');
    equal(result.validatorSource, ['corrected', 'keyed'].includes(mode) ? mode : 'original', 'matching validator source revision');
    equal(result.validation.valid, true, 'server validation of keyed names');
    same(result.normalized, keyedData, 'keyed native values without hidden sequence fields');
    same(Object.keys(result.normalized.companies), Object.keys(keyedData.companies), 'native keyed document order');
  }],
  ['initialization', async () => {
    const baseline = new Map();
    initializationEvidence = {
      generatedAt: new Date().toISOString(), server, mode, framework, transport: transport.value, commit: __SOURCE_COMMIT__,
      stages: [], comparisons: [], cssFailures: {}, randomSource: 'Repeated deterministic 7-byte inputs during row actions only',
    };
    const categories = ['html', 'dom', 'controls', 'fields', 'css', 'data', 'focus', 'response'];
    function compare(actual, expected, label, keys = categories) {
      const results = compareSnapshots(actual, expected, keys);
      initializationEvidence.comparisons.push({ label, results });
      if (results.some(result => result.category === 'css' && !result.passed)) {
        initializationEvidence.cssFailures[label] = { expected: expected.css, actual: actual.css };
      }
    }
    const descriptor = Object.getOwnPropertyDescriptor(crypto, 'getRandomValues');
    const random = crypto.getRandomValues.bind(crypto);
    let counter = 0;
    const repeatableRandom = bytes => {
      if (!(bytes instanceof Uint8Array) || bytes.length !== 7) return random(bytes);
      const seed = counter++;
      for (let index = 0; index < bytes.length; index++) bytes[index] = (171 + seed * 17 + index * 29) % 256;
      return bytes;
    };
    const restoreRandom = () => {
      if (descriptor) Object.defineProperty(crypto, 'getRandomValues', descriptor);
      else delete crypto.getRandomValues;
    };
    async function capture(route, stage, response) {
      await settle();
      const snapshot = formSnapshot(view, form);
      snapshot.css = styleSnapshot(view);
      snapshot.data = encodeJson(driver.getData());
      const active = document.activeElement;
      snapshot.focus = view.contains(active) ? {
        name: active.getAttribute('name'), class: active.getAttribute('class'),
        row: active.closest('[data-uniqid]')?.getAttribute('data-uniqid'),
        start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection,
      } : null;
      snapshot.response = response;
      const cssHash = await snapshotHash(snapshot.css);
      initializationEvidence.stages.push({ route, stage, ...snapshot, css: undefined, cssHash });
      if (route === 'initial') baseline.set(stage, snapshot);
      else {
        const expected = baseline.get(stage);
        assert(expected, `Missing initial-data snapshot for ${stage}`);
        compare(snapshot, expected, `initial/injected/${stage}`);
      }
      return snapshot;
    }
    await document.fonts.ready;
    try {
      for (const route of ['initial', 'injected']) {
        const source = (await request('reset', new URLSearchParams({ fixture: keyed ? 'populated' : 'default' }))).data;
        await mount(route === 'initial' ? source : {});
        if (route === 'injected') {
          assert(view.querySelector('input[name]'), 'A form must exist before record injection');
          await driver.load(source);
        }
        const mounted = await capture(route, 'mounted');
        const template = JSON.stringify(driver.template);
        for (let attempt = 1; attempt <= 2; attempt++) {
          await driver.load(source);
          const again = await capture(route, `reinjected-${attempt}`);
          compare(again, mounted, `${route}/idempotence-${attempt}`);
          identical(JSON.stringify(driver.template), template, 'cached template');
        }
        const changed = structuredClone(source);
        Object.values(Object.values(changed.companies)[0].stores)[0].enabled = '';
        await driver.load(changed);
        await capture(route, 'data-hidden');
        await driver.load(source);
        const restored = await capture(route, 'data-restored');
        compare(restored, mounted, `${route}/record-restoration`);
        await edit(companyName(companies()[0]), 'Initialization company');
        await edit(storeName(stores(companies()[0])[0]), 'Initialization store');
        const notes = stores(companies()[0])[0].querySelector('textarea');
        await edit(notes, 'Initialization notes');
        stores(companies()[0])[0].querySelector('input[type=checkbox]').click();
        await capture(route, 'edited');
        const saved = await save();
        equal(saved.status, 200, 'initialization save status');
        await capture(route, 'saved', { validation: saved.validation, records: storageRows(saved.storage), keyChanges: saved.keyChanges });
        await load();
        await capture(route, 'reloaded');
        counter = 0;
        crypto.getRandomValues = repeatableRandom;
        await click(companies()[0], 'copy');
        await capture(route, 'copied');
        await click(companies()[1], 'move-up');
        await capture(route, 'moved');
        await click(companies()[0], 'minus');
        await capture(route, 'copy-removed');
        await click(companies()[0], 'plus');
        await edit(companyName(companies()[1]), 'Added company');
        await edit(storeName(stores(companies()[1])[0]), 'Added store');
        await capture(route, 'added');
        const added = await save();
        equal(added.status, 200, 'added initialization save status');
        await capture(route, 'saved-new', { validation: added.validation, records: storageRows(added.storage), keyChanges: added.keyChanges });
        restoreRandom();
        await driver.load({ companies: keyed ? {} : [] });
        await capture(route, 'empty');
        await driver.load(source);
        await capture(route, 'restored');
      }
    } finally { restoreRandom(); }
    const failures = initializationEvidence.comparisons.flatMap(comparison =>
      comparison.results.filter(result => !result.passed).map(result => `${comparison.label}/${result.error}`));
    assert(failures.length === 0, failures.join('\n'));
  }],
  ['cache', async () => {
    assert(driver.template && driver.referenceReads, 'This example adapter rebuilds through buildForm and does not prepare a cached structure');
    equal(driver.referenceReads(), 1, 'reference reads before data injection');
    const before = JSON.stringify(driver.template);
    await load();
    await edit(companyName(companies()[0]), 'Cache isolation check');
    await load();
    equal(companyName(companies()[0]).value, 'Company A', 'cached structure receives fresh data');
    equal(driver.referenceReads(), 1, 'reference reads after repeated data injection');
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
      if (id === 'initialization') initializationEvidence = undefined;
      let error;
      try { await reset(); await test(); } catch (e) { error = e.message; }
      const item = { id, passed: !error, ...(error ? { error } : {}), ...(id === 'initialization' ? { evidence: initializationEvidence } : {}) };
      results.push(item);
      const line = document.createElement('div');
      line.className = error ? 'fail' : 'pass';
      const status = document.createElement('p'); status.textContent = `${error ? t.fail : t.pass} · ${t[id]}`;
      line.append(status);
      if (error) {
        const explanation = t.failureNotes[mode]?.[id];
        if (explanation) { const note = document.createElement('p'); note.textContent = explanation; line.append(note); }
        const detail = document.createElement('details');
        const summary = document.createElement('summary'); summary.textContent = t.failureDetails;
        const raw = document.createElement('pre'); raw.textContent = error;
        detail.append(summary, raw); line.append(detail);
      }
      if (id === 'initialization' && initializationEvidence) appendInitializationEvidence(line, initializationEvidence, t);
      output.append(line);
    }
    await reset();
    const report = { server, mode, framework, transport: method, commit: __SOURCE_COMMIT__, results };
    window.comparison.lastReport = report;
    return report;
  } finally { running = false; transport.disabled = false; }
}
function action(id, fn) {
  document.querySelector(`#${id}`).addEventListener('click', async () => {
    if (running) return;
    try { await fn(); await settle(); inspect(); }
    catch (error) { document.querySelector('#results').textContent = error.message; }
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
action('initialization-check', () => runChecks(transport.value, 'initialization'));
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (running) return;
  try { await save(); }
  catch (error) { document.querySelector('#results').textContent = error.message; }
});
for (const name of ['input', 'change', 'click']) view.addEventListener(name, async () => { await settle(); inspect(); });
await mount();
await load();
window.comparison = { runChecks, reset, inspect, submit, save, load, server, mode, framework, commit: __SOURCE_COMMIT__ };
