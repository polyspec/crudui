// The end-to-end check of the canonical page (docs/spec/form-comparison.md, "Canonical flow
// check"): for each of the 40 server, client and initialization combinations, open the list at
// page 2, open one record's detail, open its form, change the score, save, and require the list
// on page 2 to show the saved value and the saved notice. Each combination is one unit with its own
// timeout; the check runs the units in a bounded pool.
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

/** Run one combination in its own browser context. */
export async function runPipelineCombination({ browser, origin, combination, signal }) {
  const { selection, recordId, score, submit } = combination;
  await checkInitialDocuments(origin, combination, { signal });
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

    const stored = await fetch(new URL(`/api/${selection.server}/records/${recordId}`, origin), { signal });
    assert.equal(stored.status, 200);
    assert.equal((await stored.json()).record.score, Number(score), 'the selected server stored the score');
    if (selection.initialization === 'ssr') {
      const html = await (await fetch(new URL(listAddress, origin), { signal })).text();
      assert.match(html, new RegExp(`id="saved-notice"[^>]*data-record-id="${recordId}"`), 'the SSR list document carries the notice');
      assert.ok(stageContent(html)?.includes(`>${scoreCellText(score, selection.lang)}<`), 'the SSR list document carries the saved score');
    }
    return { recordId, score };
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
