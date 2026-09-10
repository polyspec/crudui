import assert from 'node:assert/strict';
import test from 'node:test';
import puppeteer from 'puppeteer';

import { collectBrowserJob } from './browser-job.mjs';

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
