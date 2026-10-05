// The canonical flow check against a local stack built from this checkout: the public server (which
// is also the JavaScript record server) and the PHP, PHP extension, Go and Rust record servers.
// Each of the 40 combinations is one test with its own timeout; four run at a time.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import puppeteer from 'puppeteer';

import { setup, teardown } from '../../scripts/test-progress/hooks.mjs';

import {
  exampleDirectory, prepareRecordServers, publicServerDefinition, recordServerProcess, repositoryRoot,
  startProcess,
} from './src/local-servers.mjs';
import {
  pipelineCombinations, pipelineConcurrency, pipelineResetLimitMs, pipelineResetUnits, pipelineUnitLimitMs,
  runPipelineCombination,
} from './src/pipeline-flow.mjs';
import { recordServers } from './src/record-contract.mjs';
import { sourceIdentity } from './src/source-tree.mjs';
import { runStages } from './src/step-runner.mjs';


let root;
let browser;
let origin;
const processes = [];

// The stack setup runs the checkout, the builds and the process starts and prints their progress.
setup('stack start', async () => {
  root = await mkdtemp(path.join(tmpdir(), 'crudui-pipeline-'));
  const publicDirectory = path.join(root, 'public');
  const dataDirectory = path.join(root, 'data');
  await mkdir(dataDirectory, { recursive: true });
  const prepared = await prepareRecordServers({ buildDirectory: path.join(root, 'bin') });
  const [build] = await runStages([[{
    id: 'public-build', command: process.execPath,
    args: [path.join(exampleDirectory, 'build.mjs'), publicDirectory], cwd: repositoryRoot, environment: {},
  }]], { label: 'local-servers' });
  assert.equal(build.status, 'passed', `public build ${build.status}`);
  const source = await sourceIdentity(repositoryRoot);
  await writeFile(path.join(publicDirectory, 'source.json'), JSON.stringify(source) + '\n');
  // Every record server takes a port of the system and names it on its readiness line; the public
  // server starts with those ports and forwards to the others per request.
  const servers = recordServers.filter(name => name !== 'js');
  const definitions = await Promise.all(servers.map(server => recordServerProcess(server, { dataDirectory, publicDirectory, prepared })));
  const started = await Promise.allSettled(definitions.map(definition => startProcess(definition)));
  processes.push(...started.filter(result => result.status === 'fulfilled').map(result => result.value));
  const failed = started.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
  const ports = Object.fromEntries(servers.map((server, index) => [server, started[index].value.port]));
  const publicServer = publicServerDefinition({ dataDirectory, publicDirectory, ports });
  processes.push(await startProcess(publicServer, { ipc: true, message: { status: 'ready', cycle: 1, source, error: null } }));
  origin = processes.at(-1).origin;
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
