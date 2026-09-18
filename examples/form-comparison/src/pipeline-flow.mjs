// The end-to-end check of the canonical page (docs/spec/form-comparison.md, "Canonical flow
// check"): for each of the 40 server, client and initialization combinations, open the list at
// page 2, open one record's detail, open its form, change the score, uncheck `enabled` of the first
// store of the first company, add a named department to that store, save, and require the list on
// page 2 to show the saved value and the saved notice and the selected server to have stored the
// edits. Each combination is one unit with its own timeout; the check runs the units in a bounded
// pool.
import assert from 'node:assert/strict';

import { buildList } from '@crudui/generator-core';

import {
  pageAddress, recordClients, recordInitializations, recordModes, recordServers, recordSpecs,
  selectionQuery,
} from './record-contract.mjs';

/**
 * One combination's limit. Not yet measured: the flow does not run yet. It allows four page loads
 * and one save of a few seconds each and must be replaced by ten times the measured duration of
 * the slowest combination once the flow runs.
 */
export const pipelineUnitLimitMs = 60_000;
/** Resetting one server's record store: one request that writes one file. Not yet measured. */
export const pipelineResetLimitMs = 10_000;
/** Combinations that run at the same time, each in its own browser context. */
export const pipelineConcurrency = 4;
/** The page every combination starts from and returns to. */
export const pipelinePage = 2;
const readinessMembers = ['framework', 'id', 'initialization', 'mode', 'page', 'server', 'type', 'view'];

/**
 * The 40 combinations in execution order. Each one edits its own record on page 2 of its server's
 * store, so combinations of one server never read each other's saved values. The form mode
 * alternates so that every server and every client runs both modes, and the language alternates
 * with the initialization.
 */
export function pipelineCombinations() {
  return recordServers.flatMap((server, serverIndex) => recordClients.flatMap((framework, clientIndex) =>
    recordInitializations.map((initialization, initializationIndex) => ({
      id: `${server}/${framework}/${initialization}`,
      selection: {
        lang: initializationIndex === 0 ? 'en' : 'ko', server, framework, initialization,
        mode: recordModes[(clientIndex + initializationIndex) % recordModes.length], page: pipelinePage,
      },
      recordId: String(21 + clientIndex * 2 + initializationIndex),
      score: String(9_100 + serverIndex * 10 + clientIndex * 2 + initializationIndex),
      department: `Desk ${9_100 + serverIndex * 10 + clientIndex * 2 + initializationIndex}`,
      submit: (clientIndex + initializationIndex) % 2 === 0 ? 'button' : 'enter',
    }))));
}

/** The list cell text of one score, as the shared list model formats it. */
export function scoreCellText(score, language) {
  const spec = recordSpecs().list;
  const index = Object.keys(spec.columns).indexOf('score');
  const record = { id: '1', name: 'x', status: 'active', joined: '2026-01-01', score: Number(score), relation: { name: 'x' }, avatar: '', markup: '' };
  return buildList(spec, [record], { language }).rows[0].cells[index].display;
}

const escapeAttribute = text => text.replaceAll('&', '&amp;');

/** The stage section of one document, or null when the document has none. */
export function stageContent(html) {
  const match = /<section id="stage"[^>]*>([\s\S]*?)<\/section>/.exec(html);
  return match ? match[1] : null;
}

/**
 * The initial document of each page, as view-source shows it: an SSR document carries the rendered
 * stage and its data, a CSR document carries an empty stage and no stage data.
 */
export async function checkInitialDocuments(origin, combination, { signal } = {}) {
  const { selection, recordId } = combination;
  const query = escapeAttribute(selectionQuery(selection));
  const documents = [
    ['list', pageAddress('list', selection), `href="/detail?id=${recordId}&amp;${query}"`],
    ['detail', pageAddress('detail', selection, { id: recordId }), `href="/form?id=${recordId}&amp;${query}"`],
    ['form', pageAddress('form', selection, { id: recordId }), `action="/api/${selection.server}/records/${recordId}"`],
  ];
  for (const [view, address, marker] of documents) {
    const response = await fetch(new URL(address, origin), { signal });
    assert.equal(response.status, 200, `${view} document ${address}`);
    const html = await response.text();
    const stage = stageContent(html);
    assert.notEqual(stage, null, `${view} document has the stage section`);
    if (selection.initialization === 'ssr') {
      assert.ok(stage.includes(marker), `SSR ${view} document contains the rendered stage (${marker})`);
      assert.match(html, /<script type="application\/json" id="crudui-stage-data">/, `SSR ${view} document carries the stage data`);
    } else {
      assert.equal(stage.trim(), '', `CSR ${view} document has an empty stage`);
      assert.doesNotMatch(html, /crudui-stage-data|class="crudui-(?:list|detail|form)"/, `CSR ${view} document carries no rendered stage`);
    }
  }
}

/**
 * Subscribe to the page's readiness events before the first navigation. `next()` waits for the
 * next `crudui:pipeline-ready` event; a script error or a page failure rejects the wait.
 */
export async function subscribePipelineReadiness(page) {
  const events = [];
  const waiters = [];
  let failure;
  const settle = () => {
    while (waiters.length > 0 && (events.length > 0 || failure)) {
      const waiter = waiters.shift();
      if (failure) waiter.reject(failure);
      else waiter.resolve(events.shift());
    }
  };
  const fail = error => { failure ??= error; settle(); };
  page.on('pageerror', error => fail(new Error(`Page script error: ${error.message}`)));
  page.on('error', error => fail(new Error(`Page failed: ${error.message}`)));
  await page.exposeFunction('cruduiPipelineReady', event => { events.push(event); settle(); });
  await page.evaluateOnNewDocument(() => {
    addEventListener('message', event => {
      if (event.origin === location.origin && event.source === window && event.data?.type === 'crudui:pipeline-ready') {
        globalThis.cruduiPipelineReady(event.data);
      }
    });
  });
  return {
    next: () => new Promise((resolve, reject) => { waiters.push({ resolve, reject }); settle(); }),
  };
}

async function expectReady(readiness, combination, view, id) {
  const event = await readiness.next();
  assert.deepEqual(Object.keys(event).sort(), readinessMembers, `${view} readiness members`);
  const { selection } = combination;
  assert.deepEqual(event, {
    type: 'crudui:pipeline-ready', view, server: selection.server, framework: selection.framework,
    initialization: selection.initialization, mode: selection.mode, page: selection.page, id,
  }, `${view} readiness`);
}

function expectAddress(page, origin, address, view) {
  const url = new URL(page.url());
  assert.equal(url.origin + url.pathname + url.search, new URL(address, origin).href, `${view} address`);
}

/** One record as the selected server's public record API returns it. */
async function storedRecord(origin, server, id, signal) {
  const response = await fetch(new URL(`/api/${server}/records/${id}`, origin), { signal });
  assert.equal(response.status, 200, `GET /api/${server}/records/${id}`);
  return (await response.json()).record;
}

/**
 * The first store of the first company of `record`: its keys, its field path and its stored value.
 * The flow edits this store.
 */
export function firstStore(record) {
  const [companyKey, company] = Object.entries(record.companies ?? {})[0] ?? [];
  assert.ok(company, `record ${record.id} has a company`);
  const [storeKey, store] = Object.entries(company.stores)[0] ?? [];
  assert.ok(store, `record ${record.id}: the first company has a store`);
  return { companyKey, storeKey, store, path: `companies.${companyKey}.stores.${storeKey}` };
}

/**
 * The companies the server must store after the flow: the stored companies with the first store's
 * `enabled` unchecked, its `detail` kept and the added department as the last row of its
 * departments.
 */
export function editedCompanies(companies, departmentKey, department) {
  const edited = structuredClone(companies);
  const { companyKey, storeKey } = firstStore({ companies });
  const store = edited[companyKey].stores[storeKey];
  store.enabled = '';
  store.departments[departmentKey] = { name: department };
  return edited;
}

/**
 * Uncheck `enabled` of the edited store and require its `detail` to be hidden, then add a
 * department row with the row action and type its name. Returns the new row's key.
 */
async function editStore(page, recordId, { path, store }, department) {
  const form = '#stage form#record-form';
  const enabled = await page.$(`${form} [data-field-path="${path}.enabled"] input[type="checkbox"]`);
  assert.ok(enabled, `the form edits ${path}.enabled`);
  const detail = `${form} [data-field-path="${path}.detail"] textarea`;
  assert.equal(await enabled.evaluate(input => input.checked), true, `record ${recordId}: ${path}.enabled starts checked`);
  assert.equal(await page.$eval(detail, textarea => textarea.checkVisibility()), true, `record ${recordId}: ${path}.detail starts visible`);
  await enabled.click();
  assert.equal(await enabled.evaluate(input => input.checked), false, `${path}.enabled is unchecked`);
  await page.waitForFunction(selector => {
    const textarea = document.querySelector(selector);
    return textarea !== null && !textarea.checkVisibility();
  }, { timeout: 0, polling: 'mutation' }, detail);

  const departments = `${form} [data-field-path="${path}.departments"]`;
  const rows = `${departments} > .crudui-node__body > [data-crudui-row-key]`;
  const keys = () => page.$$eval(rows, elements => elements.map(element => element.dataset.cruduiRowKey));
  const before = await keys();
  assert.deepEqual(before, Object.keys(store.departments), `the form shows the departments of ${path}`);
  // A row's add-row control sits in its header container; an empty collection holds its only
  // add-row control in the collection footer (docs/spec/empty-collections.md).
  const add = before.length > 0
    ? `${rows}[data-crudui-row-key="${before.at(-1)}"] > .crudui-node__header-container > .crudui-node__header [data-crudui-action="add-row"]`
    : `${departments} > .crudui-node__footer [data-crudui-action="add-row"]`;
  const button = await page.$(add);
  assert.ok(button, `the departments of ${path} have the add-row control`);
  await button.click();
  await page.waitForFunction((selector, count) => document.querySelectorAll(selector).length === count,
    { timeout: 0, polling: 'mutation' }, rows, before.length + 1);
  const after = await keys();
  const key = after.at(-1);
  assert.deepEqual(after.slice(0, -1), before, 'the added department is the last row');
  assert.match(key, /^__[0-9a-f]{13}__$/, 'the added department has a row key');
  const name = await page.$(`${form} [data-field-path="${path}.departments.${key}.name"] input`);
  assert.ok(name, 'the added department has its name input');
  await name.evaluate(input => { input.focus(); input.select(); });
  await page.keyboard.type(department);
  assert.equal(await name.evaluate(input => input.value), department, 'the added department is named');
  return key;
}

/** Run one combination in its own browser context. */
export async function runPipelineCombination({ browser, origin, combination, signal }) {
  const { selection, recordId, score, department, submit } = combination;
  await checkInitialDocuments(origin, combination, { signal });
  const original = await storedRecord(origin, selection.server, recordId, signal);
  const edited = firstStore(original);
  const context = await browser.createBrowserContext();
  const close = () => context.close().catch(() => {});
  signal?.addEventListener('abort', close, { once: true });
  try {
    const page = await context.newPage();
    const readiness = await subscribePipelineReadiness(page);
    const query = selectionQuery(selection);

    await page.goto(new URL(pageAddress('list', selection), origin).href);
    await expectReady(readiness, combination, 'list', null);
    const detailAddress = pageAddress('detail', selection, { id: recordId });
    const detailLink = await page.$(`#stage a[href="/detail?id=${recordId}&${query}"]`);
    assert.ok(detailLink, `the list links record ${recordId} to ${detailAddress}`);
    await detailLink.click();
    await expectReady(readiness, combination, 'detail', recordId);
    expectAddress(page, origin, detailAddress, 'detail');

    const formAddress = pageAddress('form', selection, { id: recordId });
    const formLink = await page.$(`#stage a[href="/form?id=${recordId}&${query}"]`);
    assert.ok(formLink, `the detail links record ${recordId} to ${formAddress}`);
    await formLink.click();
    await expectReady(readiness, combination, 'form', recordId);
    expectAddress(page, origin, formAddress, 'form');

    const idInput = await page.$('#stage form#record-form input[name="form[id]"]');
    assert.ok(idInput, 'the form shows the record id');
    assert.equal(await idInput.evaluate(input => [input.value, input.readOnly].join()), `${recordId},true`, 'the id is read-only');
    const scoreInput = await page.$('#stage form#record-form input[name="form[score]"]');
    assert.ok(scoreInput, 'the form edits the score');
    await scoreInput.evaluate(input => { input.focus(); input.select(); });
    await page.keyboard.type(score);
    const departmentKey = await editStore(page, recordId, edited, department);
    if (submit === 'button') {
      const button = await page.$('#stage form#record-form button[type="submit"]');
      assert.ok(button, 'the form has its save button');
      await button.click();
    } else {
      await page.keyboard.press('Enter');
    }
    await expectReady(readiness, combination, 'list', null);
    const listAddress = pageAddress('list', selection, { saved: recordId });
    expectAddress(page, origin, listAddress, 'list after save');

    const result = await page.evaluate((id, detail) => {
      const notice = document.querySelector('#saved-notice');
      const headings = [...document.querySelectorAll('#stage thead th')];
      const column = headings.findIndex(heading => heading.dataset.field === 'score');
      const row = document.querySelector(`#stage a[href="${detail}"]`)?.closest('tr');
      return {
        notice: notice && { id: notice.dataset.recordId, role: notice.getAttribute('role'), visible: notice.checkVisibility() },
        score: row?.children[column]?.textContent ?? null,
      };
    }, recordId, `/detail?id=${recordId}&${query}`);
    assert.deepEqual(result.notice, { id: recordId, role: 'status', visible: true }, 'the list shows the saved notice');
    assert.equal(result.score, scoreCellText(score, selection.lang), 'the list on the same page shows the saved score');

    const stored = await storedRecord(origin, selection.server, recordId, signal);
    assert.equal(stored.score, Number(score), 'the selected server stored the score');
    // JSON text compares the members of every object in order.
    assert.equal(JSON.stringify(stored.companies), JSON.stringify(editedCompanies(original.companies, departmentKey, department)),
      `the selected server stored ${edited.path} with enabled "", its detail and the added department last`);
    if (selection.initialization === 'ssr') {
      const html = await (await fetch(new URL(listAddress, origin), { signal })).text();
      assert.match(html, new RegExp(`id="saved-notice"[^>]*data-record-id="${recordId}"`), 'the SSR list document carries the notice');
      assert.ok(stageContent(html)?.includes(`>${scoreCellText(score, selection.lang)}<`), 'the SSR list document carries the saved score');
    }
    return { recordId, score, department };
  } finally {
    signal?.removeEventListener('abort', close);
    await close();
  }
}

/** Reset every server's record store through the public API before its combinations run. */
export function pipelineResetUnits(origin) {
  return recordServers.map(server => ({
    id: `reset/${server}`, timeoutMs: pipelineResetLimitMs,
    run: async signal => {
      const response = await fetch(new URL(`/api/${server}/records/reset`, origin), { method: 'POST', signal });
      assert.equal(response.status, 200, `${server} reset: ${await response.text()}`);
    },
  }));
}

/** The combination units of one run against one origin. */
export function pipelineUnits({ browser, origin }) {
  return pipelineCombinations().map(combination => ({
    id: combination.id, timeoutMs: pipelineUnitLimitMs,
    run: signal => runPipelineCombination({ browser, origin, combination, signal }),
  }));
}
