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
    const client = {
      start: durationMs => jobPage.evaluate(milliseconds => {
        window.testJob = {
          status: 'running', totalReports: 1, completedReports: 0, current: 'report',
          reports: [],
        };
        setTimeout(() => {
          window.testJob.reports.push({ id: 'completed' });
          Object.assign(window.testJob, {
            status: 'completed', completedReports: 1, current: null,
          });
        }, milliseconds);
        const { reports, ...state } = window.testJob;
        return state;
      }, durationMs),
      state: () => jobPage.evaluate(() => {
        const { reports, ...state } = window.testJob;
        return state;
      }),
      report: index => jobPage.evaluate(value => window.testJob.reports[value], index),
    };

    const collected = await collectBrowserJob(client, 1_500, { intervalMs: 20 });
    assert.equal(collected.state.status, 'completed');
    assert.deepEqual(collected.reports, [{ id: 'completed' }]);
  });
