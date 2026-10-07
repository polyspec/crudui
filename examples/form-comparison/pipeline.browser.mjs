// The canonical flow check against a local stack built from this checkout: the public server (which
// is also the JavaScript record server) and the PHP, PHP extension, Go and Rust record servers.
// Each of the 40 combinations is one test with its own timeout; four run at a time.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import puppeteer from 'puppeteer';

import { setup, teardown } from '../../scripts/test-progress/hooks.mjs';

import { startLocalStack } from './src/local-servers.mjs';
import {
  pipelineCombinations, pipelineConcurrency, pipelineResetLimitMs, pipelineResetUnits, pipelineUnitLimitMs,
  runPipelineCombination,
} from './src/pipeline-flow.mjs';
import { recordServers } from './src/record-contract.mjs';


let root;
let browser;
let origin;
const processes = [];

// The stack setup runs the checkout, the builds and the process starts and prints their progress.
setup('stack start', async () => {
  root = await mkdtemp(path.join(tmpdir(), 'crudui-pipeline-'));
  ({ origin } = await startLocalStack({ root, processes }));
});

setup('browser launch', async () => {
  browser = await puppeteer.launch({ headless: true, protocolTimeout: pipelineUnitLimitMs });
});

// The teardowns end when the browser has closed, every server process has exited and the
// directory is removed; the servers stop at the same time.
teardown('browser close', () => browser?.close());
teardown('server stop', () => Promise.all(processes.map(async running => {
  const started = performance.now();
  await running.stop();
  process.stdout.write(`[teardown] server stop: ${running.origin} exited after ${((performance.now() - started) / 1000).toFixed(1)}s\n`);
})));
teardown('directory removal', () => root && rm(root, { recursive: true, force: true }));

describe('record stores reset', { concurrency: recordServers.length }, () => {
  for (const server of recordServers) {
    test(server, { timeout: pipelineResetLimitMs }, async t => {
      assert.ok(origin, 'the local stack did not start');
      const unit = pipelineResetUnits(new URL(origin)).find(item => item.id === `reset/${server}`);
      await unit.run(t.signal);
    });
  }
});

describe('canonical flow', { concurrency: pipelineConcurrency }, () => {
  for (const combination of pipelineCombinations()) {
    test(combination.id, { timeout: pipelineUnitLimitMs }, async t => {
      assert.ok(origin && browser, 'the local stack did not start');
      await runPipelineCombination({ browser, origin: new URL(origin), combination, signal: t.signal });
    });
  }
});
