import assert from 'node:assert/strict';

/** Use browser pointer and keyboard input to verify focus, scrolling and conditions. */
export async function checkInteraction(page, servers) {
  const results = [];
  for (const server of servers) {
  for (const framework of ['react', 'vue', 'svelte']) {
    for (const originalMode of ['corrected', 'original-keyed', 'original']) {
      await page.evaluate(([framework, originalMode, server]) => window.comparison.show(framework, originalMode, server), [framework, originalMode, server]);
      for (const frame of page.frames().filter(frame => frame.url().includes('/frames/'))) {
        const mode = await frame.evaluate(() => window.comparison.mode);
        if (mode === 'keyed' && originalMode !== 'corrected') continue;
        for (const transport of ['form', 'json']) {
          await frame.select('#transport', transport);
          for (const action of ['pointer', 'keyboard', 'condition', 'validation', ...(['corrected', 'keyed'].includes(mode) ? ['empty-keyboard'] : [])]) {
            let error;
            try {
              await frame.evaluate(() => window.comparison.reset());
              if (action === 'empty-keyboard') {
                await (await frame.$('[name="form.companies-layer"] > .form-element > .input-group-wrapper > .input-group-btn > .btn-minus')).click();
                const selector = '[name="form.companies-layer"] > .form-element > button.btn-plus';
                await frame.waitForSelector(selector);
                await (await frame.$(selector)).focus();
                const before = await frame.evaluate(() => document.scrollingElement.scrollTop);
                const parentScroll = await page.evaluate(() => window.scrollY);
                await page.keyboard.press('Enter');
                await frame.waitForFunction(() => document.querySelector('[name="form.companies-layer"] > .form-element > .input-group-wrapper'));
                await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
                const active = await frame.evaluate(() => ({
                  isAdd: document.activeElement.matches('button.btn-plus'),
                  wrapper: document.activeElement.closest('.form-element-wrapper[name]')?.getAttribute('name'),
                  scroll: document.scrollingElement.scrollTop,
                }));
                assert.equal(active.isAdd, true, 'Empty addition retains Add button focus');
                assert.equal(active.wrapper, 'form.companies-layer', 'Focused button belongs to the same collection');
                assert.ok(Math.abs(active.scroll - before) <= 1, 'Empty addition preserves frame scroll');
                assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - parentScroll) <= 1, 'Empty addition preserves page scroll');
              } else if (action === 'validation') {
                const selector = 'input[name$="[stores][__0000000000001__][name]"], input[name$="[stores][0][name]"]';
                const input = await frame.$(selector);
                await input.click({ count: 3 });
                await input.press('Backspace');
                await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
                const requests = [];
                const record = request => { if (request.url().endsWith(`/api/${server}/save/${mode}/${framework}`)) requests.push(request); };
                page.on('request', record);
                try {
                  await (await frame.$('#save')).click();
                  await frame.waitForFunction(() => document.querySelector('#validation').textContent.length > 0);
                  await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
                  assert.equal(requests.length, 0, 'Invalid browser data must not be submitted');
                  assert.equal(await frame.$eval(selector, input => input.getAttribute('aria-invalid')), 'true', 'Field error displayed');
                  await (await frame.$(selector)).type('Seoul', { delay: 50 });
                  assert.equal(await frame.$eval(selector, input => input.value), 'Seoul', 'Continuous typing preserves all characters');
                  assert.equal(await frame.$eval(selector, input => input === document.activeElement), true, 'Continuous typing retains input focus');
                  const response = page.waitForResponse(response => response.url().endsWith(`/api/${server}/save/${mode}/${framework}`));
                  await (await frame.$('#save')).click();
                  assert.equal((await response).status(), 200, 'Valid input is saved');
                  assert.equal(requests.length, 1, 'Exactly one valid save request');
                  assert.equal(requests[0].headers()['content-type'].split(';')[0], transport === 'json' ? 'application/json' : 'multipart/form-data', 'Actual browser transmission type');
                  if (transport === 'json') {
                    const body = JSON.parse(requests[0].postData());
                    assert.deepEqual(Object.keys(body), ['form'], 'JSON request has only the form data');
                    assert.equal(Array.isArray(body.form.companies), mode === 'original', 'Actual JSON collection type');
                  }
                  assert.equal(await frame.$eval('#validation', output => output.textContent), '', 'Corrected input clears errors');
                  const savedInput = await frame.$(selector);
                  await savedInput.click({ count: 3 });
                  await savedInput.press('Backspace');
                  await (await frame.$('#save')).click();
                  await frame.waitForFunction(() => document.querySelector('#validation').textContent.length > 0);
                  assert.equal(requests.length, 1, 'Second invalid save is also blocked');
                  await (await frame.$('#load')).click();
                  await frame.waitForFunction(selector => document.querySelector('#validation').textContent === '' && document.querySelector(selector).value === 'Seoul', {}, selector);
                  assert.equal(await frame.$eval(selector, input => input.getAttribute('aria-invalid')), null, 'Reload clears old field errors');
                } finally { page.off('request', record); }
              } else if (action === 'condition') {
                const selector = 'input[type=checkbox]';
                assert.equal(await frame.$eval(selector, input => input.checked), true);
                await (await frame.$(selector)).click();
                await frame.waitForFunction(() => document.querySelector('textarea').closest('.form-element-wrapper').style.display === 'none');
                await (await frame.$(selector)).click();
                await frame.waitForFunction(() => document.querySelector('textarea').closest('.form-element-wrapper').style.display !== 'none');
              } else {
                const button = await frame.$('[name="form.companies-layer"] > .form-element > .input-group-wrapper > .input-group-btn > .btn-plus');
                await button.scrollIntoView();
                const before = await frame.evaluate((button, action) => {
                  const input = document.querySelector('input[name]');
                  const active = action === 'pointer' ? input : button;
                  active.focus({ preventScroll: true });
                  if (action === 'pointer') input.setSelectionRange(2, 5, 'backward');
                  return { name: input.name, scroll: document.scrollingElement.scrollTop, buttonY: button.getBoundingClientRect().top };
                }, button, action);
                const parentScroll = await page.evaluate(() => window.scrollY);
                if (action === 'pointer') await button.click();
                else await page.keyboard.press('Enter');
                await frame.waitForFunction(() => document.querySelector('[name="form.companies-layer"] > .form-element').children.length === 2);
                await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
                const after = await frame.evaluate(button => ({
                  name: document.activeElement.name,
                  start: document.activeElement.selectionStart,
                  end: document.activeElement.selectionEnd,
                  direction: document.activeElement.selectionDirection,
                  buttonFocused: document.activeElement === button,
                  scroll: document.scrollingElement.scrollTop,
                  buttonY: button.getBoundingClientRect().top,
                }), button);
                if (action === 'pointer') {
                  assert.equal(after.name, before.name, 'Active input after pointer addition');
                  assert.equal(after.start, 2); assert.equal(after.end, 5); assert.equal(after.direction, 'backward');
                } else assert.equal(after.buttonFocused, true, 'Active button after keyboard addition');
                assert.ok(Math.abs(after.scroll - before.scroll) <= 1, `Frame scroll changed: ${before.scroll} -> ${after.scroll}`);
                assert.ok(Math.abs(after.buttonY - before.buttonY) <= 1, `Button position changed: ${before.buttonY} -> ${after.buttonY}`);
                assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - parentScroll) <= 1, 'Parent page scrolled');
              }
            } catch (cause) { error = cause.message; }
            const result = { server, mode, framework, transport, action, passed: !error, ...(error ? { error } : {}) };
            results.push(result);
            process.stdout.write(`${server}/${mode}/${framework}/${transport}/${action}: ${error ? `FAIL ${error}` : 'PASS'}\n`);
          }
        }
        await frame.evaluate(() => window.comparison.reset());
      }
    }
  }
  }
  await page.evaluate(server => window.comparison.show('react', 'corrected', server), servers[0]);
  return results;
}
