import assert from 'node:assert/strict';
import { parseFrameDocument } from './src/frame-readiness.mjs';
import {
  formFrameworks, formRenderingPaths, formServers, formTransports,
} from './src/runtime-paths.mjs';

const actions = ['pointer', 'keyboard', 'condition', 'validation', 'empty-keyboard'];
const collectionSelector = '[data-field-path="companies"]';
const storeSelector = 'input[name$="[stores][__0000000000001__][name]"]';

/** Clear a text control deterministically on the Linux Chromium runner. */
async function clearInput(input) {
  await input.click();
  await input.press('Control+A');
  await input.press('Backspace');
}

/** Whether focus is on the first enabled visible input of the collection's row at `index`, inside the frame viewport. */
/**
 * Whether the first input of a collection row has focus and is visible to the user:
 * inside the frame viewport and inside the main page viewport. The row focus rule
 * scrolls the frame and the page only as far as needed to show the row.
 */
async function newRowFocus(frame, index) {
  const iframe = await frame.frameElement();
  return iframe.evaluate((element, selector, position) => {
    const document = element.contentDocument;
    const view = element.contentWindow;
    const row = document.querySelector(`${selector} > .crudui-node__body`).children[position];
    const input = Array.from(row.querySelectorAll('input:not([type=hidden]),select,textarea'))
      .find(control => !control.disabled && !control.closest('[hidden]'));
    const rect = input.getBoundingClientRect();
    const frameRect = element.getBoundingClientRect();
    const top = frameRect.top + element.clientTop + rect.top;
    const left = frameRect.left + element.clientLeft + rect.left;
    return {
      focused: document.activeElement === input,
      inFrame: rect.top >= 0 && rect.bottom <= view.innerHeight && rect.left >= 0 && rect.right <= view.innerWidth,
      inPage: top >= 0 && top + rect.height <= innerHeight && left >= 0 && left + rect.width <= innerWidth,
    };
  }, collectionSelector, index);
}

async function clickAction(frame, id) {
  const action = await frame.evaluate(operation =>
    window.comparison.nextAction(operation), id);
  try {
    await (await frame.$(`#${id}`)).click();
  } catch (error) {
    await frame.evaluate(selected => window.comparison.cancelAction(selected), action);
    throw error;
  }
  return frame.evaluate(selected =>
    window.comparison.actionCompletion(selected), action);
}

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
      for (const path of formRenderingPaths) {
        await page.evaluate(([selectedFramework, selectedServer, selectedPath]) =>
          window.comparison.show(selectedFramework, selectedServer, selectedPath),
        [framework, server, path]);
        const frame = page.frames().find(item => {
          const document = parseFrameDocument(new URL(item.url()));
          return document?.initialization === 'ssr' && document.server === server
            && document.path === path && document.framework === framework;
        });
        assert.ok(frame, `${path}/${framework}: frame`);
        for (const transport of formTransports) {
          await frame.select('#transport', transport);
          for (const action of actions) {
            let error;
            try {
              await frame.evaluate(() => window.comparison.reset());
              if (action === 'empty-keyboard') {
                const remove = await frame.$(
                  `${collectionSelector} > .crudui-node__body > [data-crudui-row-key] > .crudui-node__header [data-crudui-action="remove-row"]`,
                );
                await remove.click();
                await frame.evaluate(() => window.comparison.idle());
                const selector = `${collectionSelector} > .crudui-node__footer [data-crudui-action="add-row"]`;
                await (await frame.$(selector)).focus();
                await page.keyboard.press('Enter');
                await frame.evaluate(() => window.comparison.idle());
                const focus = await newRowFocus(frame, 0);
                assert.equal(focus.focused, true, 'Empty addition focuses the first input of the new row');
                assert.equal(focus.inFrame, true, 'The focused input is inside the frame viewport');
                assert.equal(focus.inPage, true, 'The focused input is inside the page viewport');
              } else if (action === 'validation') {
                const input = await frame.$(storeSelector);
                await clearInput(input);
                await frame.evaluate(() => window.comparison.idle());
                const requests = [];
                const endpoint = `/api/${server}/save/${path}/${framework}`;
                const record = request => {
                  if (request.url().endsWith(endpoint)) requests.push(request);
                };
                page.on('request', record);
                try {
                  await clickAction(frame, 'save');
                  assert.equal(requests.length, 0,
                    'Invalid browser data must not be submitted');
                  assert.equal(await frame.$eval(storeSelector, item =>
                    item.getAttribute('aria-invalid')), 'true', 'Field error displayed');
                  await (await frame.$(storeSelector)).type('Seoul', { delay: 50 });
                  assert.equal(await frame.$eval(storeSelector, item => item.value),
                    'Seoul', 'Continuous typing preserves all characters');
                  assert.equal(await frame.$eval(storeSelector, item =>
                    item === document.activeElement), true, 'Continuous typing retains focus');
                  await frame.evaluate(() => window.comparison.idle());
                  const response = page.waitForResponse(item => item.url().endsWith(endpoint));
                  await clickAction(frame, 'save');
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
                  await clearInput(saved);
                  await frame.evaluate(() => window.comparison.idle());
                  await clickAction(frame, 'save');
                  assert.equal(requests.length, 1, 'Second invalid save is also blocked');
                  await clickAction(frame, 'load');
                  assert.equal(await frame.$eval(storeSelector, item => item.value),
                    'Seoul', 'Reload restores saved input');
                  assert.equal(await frame.$eval('#validation', output => output.textContent),
                    '', 'Reload clears validation output');
                  assert.equal(await frame.$eval(storeSelector, item =>
                    item.getAttribute('aria-invalid')), null, 'Reload clears old field errors');
                } finally {
                  page.off('request', record);
                }
              } else if (action === 'condition') {
                const selector = 'input[type=checkbox]';
                assert.equal(await frame.$eval(selector, item => item.checked), true);
                await (await frame.$(selector)).click();
                await frame.evaluate(() => window.comparison.idle());
                assert.equal(await frame.$eval('textarea', item =>
                  item.closest('[data-field-path]').hidden), true);
                await (await frame.$(selector)).click();
                await frame.evaluate(() => window.comparison.idle());
                assert.equal(await frame.$eval('textarea', item =>
                  item.closest('[data-field-path]').hidden), false);
              } else {
                const button = await frame.$(
                  `${collectionSelector} > .crudui-node__body > [data-crudui-row-key] > .crudui-node__header [data-crudui-action="add-row"]`,
                );
                await button.scrollIntoView();
                await frame.evaluate((selectedButton, selectedAction) => {
                  const active = selectedAction === 'pointer'
                    ? document.querySelector('input[name]') : selectedButton;
                  active.focus({ preventScroll: true });
                }, button, action);
                if (action === 'pointer') await button.click();
                else await page.keyboard.press('Enter');
                await frame.evaluate(() => window.comparison.idle());
                assert.equal(await frame.$eval(`${collectionSelector} > .crudui-node__body`,
                  element => element.children.length), 2, 'Addition creates one row');
                const focus = await newRowFocus(frame, 1);
                assert.equal(focus.focused, true, `${action} addition focuses the first input of the new row`);
                assert.equal(focus.inFrame, true, 'The focused input is inside the frame viewport');
                assert.equal(focus.inPage, true, 'The focused input is inside the page viewport');
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
