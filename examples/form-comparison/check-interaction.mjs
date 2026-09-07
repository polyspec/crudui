import assert from 'node:assert/strict';

/** Use browser pointer and keyboard input to verify focus, scrolling and conditions. */
export async function checkInteraction(page) {
  const results = [];
  for (const framework of ['react', 'vue', 'svelte']) {
    for (const originalMode of ['original-keyed', 'original']) {
      await page.evaluate(([framework, originalMode]) => window.comparison.show(framework, originalMode), [framework, originalMode]);
      for (const frame of page.frames().filter(frame => frame.url().includes('/frames/'))) {
        const mode = await frame.evaluate(() => window.comparison.mode);
        if (mode === 'keyed' && originalMode === 'original') continue;
        for (const action of ['pointer', 'keyboard', 'condition']) {
          let error;
          try {
            await frame.evaluate(() => window.comparison.reset());
            if (action === 'condition') {
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
          const result = { mode, framework, action, passed: !error, ...(error ? { error } : {}) };
          results.push(result);
          process.stdout.write(`${mode}/${framework}/${action}: ${error ? `FAIL ${error}` : 'PASS'}\n`);
        }
        await frame.evaluate(() => window.comparison.reset());
      }
    }
  }
  return results;
}
