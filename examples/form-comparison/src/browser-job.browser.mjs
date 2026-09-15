import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import puppeteer from 'puppeteer';

import { collectBrowserJob } from './browser-job.mjs';
import { subscribeMainPageReadiness } from './main-page-readiness.mjs';

test('loads the public frame readiness module in Chromium', async t => {
  const browser = await puppeteer.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const source = await readFile(new URL('./frame-readiness.mjs', import.meta.url), 'utf8');
  const moduleUrl = 'data:text/javascript,' + encodeURIComponent(source);
  await page.goto('data:text/html,<title>public module</title>');
  assert.equal(await page.evaluate(async url => {
    const module = await import(url);
    return typeof module.loadComparisonFrames;
  }, moduleUrl), 'function');
});

test('reports whether the pointer is over a comparison frame in Chromium', async t => {
  const browser = await puppeteer.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const source = await readFile(new URL('./frame-pointer.mjs', import.meta.url), 'utf8');
  const moduleUrl = 'data:text/javascript,' + encodeURIComponent(source);
  await page.setContent('<div style="height:100px">page</div>'
    + '<iframe style="width:400px;height:200px;border:0" srcdoc="<p style=&quot;margin:0;height:200px&quot;>frame</p>"></iframe>');
  await page.waitForFunction(() => document.querySelector('iframe').contentDocument?.querySelector('p'));
  await page.evaluate(async url => { window.frameModule = await import(url); }, moduleUrl);
  const over = () => page.evaluate(() => window.frameModule.pointerOverFrame(document.querySelector('iframe')));
  await page.mouse.move(50, 20);
  assert.equal(await over(), false, 'Pointer over the page');
  await page.mouse.move(50, 180);
  assert.equal(await over(), true, 'Pointer over the frame');
  await page.mouse.move(50, 20);
  assert.equal(await over(), false, 'Pointer moved back to the page');
});

test('receives delayed main-page readiness without one open protocol call',
  { timeout: 10_000 }, async t => {
    const browser = await puppeteer.launch({ headless: true, protocolTimeout: 1_000 });
    t.after(() => browser.close());
    const page = await browser.newPage();
    const readiness = await subscribeMainPageReadiness(page);
    const expected = {
      type: 'crudui:main-ready', server: 'php', framework: 'react',
    };
    const source = '<script>setTimeout(() => postMessage('
      + JSON.stringify(expected) + ', "*"), 1500)</script>';
    await page.goto('data:text/html,' + encodeURIComponent(source));
    assert.deepEqual(await readiness.wait(), expected);
  });

test('collects a browser job whose total duration exceeds one protocol call',
  { timeout: 30_000 }, async t => {
    const browser = await puppeteer.launch({ headless: true, protocolTimeout: 1_000 });
    t.after(() => browser.close());

    const directPage = await browser.newPage();
    await assert.rejects(
      directPage.evaluate(() => new Promise(resolve => setTimeout(resolve, 1_500))),
      /Runtime\.callFunctionOn timed out/,
    );
    await directPage.close();

    const jobPage = await browser.newPage();
    await jobPage.setContent('<!doctype html><title>browser job</title>');
    const listeners = new Set();
    await jobPage.exposeFunction('publishTestJobEvent', async event => {
      for (const listener of listeners) await listener(event);
    });
    const client = {
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      start: durationMs => jobPage.evaluate(milliseconds => {
        window.testJob = {
          status: 'running', totalReports: 1, completedReports: 0, current: 'report',
          reports: [],
        };
        setTimeout(() => {
          const report = { id: 'completed' };
          window.testJob.reports.push(report);
          Object.assign(window.testJob, {
            status: 'completed', completedReports: 1, current: null,
          });
          const { reports, ...state } = window.testJob;
          window.publishTestJobEvent({ type: 'report', index: 0, report, state })
            .then(() => window.publishTestJobEvent({ type: 'state', state }));
        }, milliseconds);
        const { reports, ...state } = window.testJob;
        return state;
      }, durationMs),
    };

    const collected = await collectBrowserJob(client, 1_500);
    assert.equal(collected.state.status, 'completed');
    assert.deepEqual(collected.reports, [{ id: 'completed' }]);
  });
