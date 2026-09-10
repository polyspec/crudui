import assert from 'node:assert/strict';
import {
  formFrameworks, formRenderingPaths, formServers, formTransports,
} from './src/runtime-paths.mjs';

const actions = ['pointer', 'keyboard', 'condition', 'validation', 'empty-keyboard'];
const collectionSelector = '[data-field-path="companies"]';
const storeSelector = 'input[name$="[stores][__0000000000001__][name]"]';

/** Return every current interaction check for the selected servers. */
export function interactionCombinations(servers) {
  if (!Array.isArray(servers) || servers.length === 0
      || servers.some(server => !formServers.includes(server))) {
    throw new TypeError('Expected one or more supported servers');
  }
  return servers.flatMap(server => formFrameworks.flatMap(framework =>
    formRenderingPaths.flatMap(path => formTransports.flatMap(transport =>
      actions.map(action => ({ server, framework, path, transport, action }))))));
}

/** Use browser input to verify focus, scrolling, conditions and validation. */
export async function checkInteraction(page, servers) {
  const results = [];
  const combinations = interactionCombinations(servers);
  for (const server of servers) {
    for (const framework of formFrameworks) {
      await page.evaluate(([selectedFramework, selectedServer]) =>
        window.comparison.show(selectedFramework, selectedServer), [framework, server]);
      for (const path of formRenderingPaths) {
        const frame = page.frames().find(item =>
          new URL(item.url()).pathname === `/frames/${path}-${framework}/`);
        assert.ok(frame, `${path}/${framework}: frame`);
        for (const transport of formTransports) {
          await frame.select('#transport', transport);
          for (const action of actions) {
            let error;
            try {
              await frame.evaluate(() => window.comparison.reset());
              if (action === 'empty-keyboard') {
                const remove = await frame.$(
                  `${collectionSelector} > .form-element > .input-group-wrapper > .input-group-btn > .btn-minus`,
                );
                await remove.click();
                const selector = `${collectionSelector} > .form-element > button.btn-plus`;
                await frame.waitForSelector(selector);
                await (await frame.$(selector)).focus();
                const before = await frame.evaluate(() => document.scrollingElement.scrollTop);
                const parentScroll = await page.evaluate(() => window.scrollY);
                await page.keyboard.press('Enter');
                await frame.waitForFunction(value =>
                  document.querySelector(`${value} > .form-element > .input-group-wrapper`),
                {}, collectionSelector);
                await frame.evaluate(() => new Promise(resolve =>
                  requestAnimationFrame(() => requestAnimationFrame(resolve))));
                const active = await frame.evaluate(selectorValue => ({
                  isAdd: document.activeElement.matches('button.btn-plus'),
                  sameCollection: document.activeElement.closest('.form-element-wrapper')
                    === document.querySelector(selectorValue),
                  scroll: document.scrollingElement.scrollTop,
                }), collectionSelector);
                assert.equal(active.isAdd, true, 'Empty addition retains Add button focus');
                assert.equal(active.sameCollection, true,
                  'Focused button belongs to the same collection');
                assert.ok(Math.abs(active.scroll - before) <= 1,
                  'Empty addition preserves frame scroll');
                assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - parentScroll) <= 1,
                  'Empty addition preserves page scroll');
              } else if (action === 'validation') {
                const input = await frame.$(storeSelector);
                await input.click({ count: 3 });
                await input.press('Backspace');
                await frame.evaluate(() => new Promise(resolve =>
                  requestAnimationFrame(() => requestAnimationFrame(resolve))));
                const requests = [];
                const endpoint = `/api/${server}/save/${path}/${framework}`;
                const record = request => {
                  if (request.url().endsWith(endpoint)) requests.push(request);
                };
                page.on('request', record);
                try {
                  await (await frame.$('#save')).click();
                  await frame.waitForFunction(() =>
                    document.querySelector('#validation').textContent.length > 0);
                  await frame.evaluate(() => new Promise(resolve =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve))));
                  assert.equal(requests.length, 0,
                    'Invalid browser data must not be submitted');
                  assert.equal(await frame.$eval(storeSelector, item =>
                    item.getAttribute('aria-invalid')), 'true', 'Field error displayed');
                  await (await frame.$(storeSelector)).type('Seoul', { delay: 50 });
                  assert.equal(await frame.$eval(storeSelector, item => item.value),
                    'Seoul', 'Continuous typing preserves all characters');
                  assert.equal(await frame.$eval(storeSelector, item =>
                    item === document.activeElement), true, 'Continuous typing retains focus');
                  const response = page.waitForResponse(item => item.url().endsWith(endpoint));
                  await (await frame.$('#save')).click();
                  assert.equal((await response).status(), 200, 'Valid input is saved');
                  assert.equal(requests.length, 1, 'Exactly one valid save request');
                  assert.equal(requests[0].headers()['content-type'].split(';')[0],
                    transport === 'json' ? 'application/json' : 'multipart/form-data',
                    'Actual browser transmission type');
                  if (transport === 'json') {
                    const body = JSON.parse(requests[0].postData());
                    assert.deepEqual(Object.keys(body), ['form'],
                      'JSON request has only the form data');
                    assert.equal(Array.isArray(body.form.companies), false,
                      'JSON collections are keyed objects');
                  }
                  assert.equal(await frame.$eval('#validation', output => output.textContent),
                    '', 'Corrected input clears errors');
                  const saved = await frame.$(storeSelector);
                  await saved.click({ count: 3 });
                  await saved.press('Backspace');
                  await (await frame.$('#save')).click();
                  await frame.waitForFunction(() =>
                    document.querySelector('#validation').textContent.length > 0);
                  assert.equal(requests.length, 1, 'Second invalid save is also blocked');
                  await (await frame.$('#load')).click();
                  await frame.waitForFunction(selector =>
                    document.querySelector('#validation').textContent === ''
                      && document.querySelector(selector).value === 'Seoul',
                  {}, storeSelector);
                  assert.equal(await frame.$eval(storeSelector, item =>
                    item.getAttribute('aria-invalid')), null, 'Reload clears old field errors');
                } finally {
                  page.off('request', record);
                }
              } else if (action === 'condition') {
                const selector = 'input[type=checkbox]';
                assert.equal(await frame.$eval(selector, item => item.checked), true);
                await (await frame.$(selector)).click();
                await frame.waitForFunction(() =>
                  document.querySelector('textarea').closest('.form-element-wrapper')
                    .style.display === 'none');
                await (await frame.$(selector)).click();
                await frame.waitForFunction(() =>
                  document.querySelector('textarea').closest('.form-element-wrapper')
                    .style.display !== 'none');
              } else {
                const button = await frame.$(
                  `${collectionSelector} > .form-element > .input-group-wrapper > .input-group-btn > .btn-plus`,
                );
                await button.scrollIntoView();
                const before = await frame.evaluate((selectedButton, selectedAction) => {
                  const input = document.querySelector('input[name]');
                  const active = selectedAction === 'pointer' ? input : selectedButton;
                  active.focus({ preventScroll: true });
                  if (selectedAction === 'pointer') input.setSelectionRange(2, 5, 'backward');
                  return {
                    name: input.name, scroll: document.scrollingElement.scrollTop,
                    buttonY: selectedButton.getBoundingClientRect().top,
                  };
                }, button, action);
                const parentScroll = await page.evaluate(() => window.scrollY);
                if (action === 'pointer') await button.click();
                else await page.keyboard.press('Enter');
                await frame.waitForFunction(selector =>
                  document.querySelector(`${selector} > .form-element`).children.length === 2,
                {}, collectionSelector);
                await frame.evaluate(() => new Promise(resolve =>
                  requestAnimationFrame(() => requestAnimationFrame(resolve))));
                const after = await frame.evaluate(selectedButton => ({
                  name: document.activeElement.name,
                  start: document.activeElement.selectionStart,
                  end: document.activeElement.selectionEnd,
                  direction: document.activeElement.selectionDirection,
                  buttonFocused: document.activeElement === selectedButton,
                  scroll: document.scrollingElement.scrollTop,
                  buttonY: selectedButton.getBoundingClientRect().top,
                }), button);
                if (action === 'pointer') {
                  assert.equal(after.name, before.name, 'Active input after pointer addition');
                  assert.equal(after.start, 2);
                  assert.equal(after.end, 5);
                  assert.equal(after.direction, 'backward');
                } else assert.equal(after.buttonFocused, true,
                  'Active button after keyboard addition');
                assert.ok(Math.abs(after.scroll - before.scroll) <= 1,
                  `Frame scroll changed: ${before.scroll} -> ${after.scroll}`);
                assert.ok(Math.abs(after.buttonY - before.buttonY) <= 1,
                  `Button position changed: ${before.buttonY} -> ${after.buttonY}`);
                assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - parentScroll) <= 1,
                  'Parent page scrolled');
              }
            } catch (cause) {
              error = cause.stack ?? cause.message;
            }
            const result = {
              server, path, framework, transport, action, passed: !error,
              ...(error ? { error } : {}),
            };
            results.push(result);
            process.stdout.write(
              `${server}/${path}/${framework}/${transport}/${action}: ${error ? `FAIL ${error}` : 'PASS'}\n`,
            );
          }
        }
        await frame.evaluate(() => window.comparison.reset());
      }
    }
  }
  assert.equal(results.length, combinations.length, 'Interaction result count differs');
  await page.evaluate(server => window.comparison.show('react', server), servers[0]);
  return results;
}
