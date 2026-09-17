// The canonical flow check against a local stack built from this checkout: the public server (which
// is also the JavaScript record server) and the PHP, PHP extension, Go and Rust record servers.
// Each of the 40 combinations is one test with its own timeout; four run at a time.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import puppeteer from 'puppeteer';

import { browserUnitLimitsMs } from './browser-report-policy.mjs';
import {
  exampleDirectory, freePort, prepareRecordServers, publicServerDefinition, recordServerProcess, repositoryRoot,
  startProcess,
} from './src/local-servers.mjs';
import {
  pipelineCombinations, pipelineConcurrency, pipelineResetLimitMs, pipelineResetUnits, pipelineUnitLimitMs,
  runPipelineCombination,
} from './src/pipeline-flow.mjs';
import { recordServers } from './src/record-contract.mjs';
import { sourceIdentity } from './src/source-tree.mjs';
import { runStages } from './src/step-runner.mjs';

// The public build measured 2.0 s.
const publicBuildLimitMs = 120_000;
// The stack hook runs the checkout, the builds and the process starts. Every operation in it holds
// its own limit and prints its progress, so the hook has no limit of its own.
const stackHook = { timeout: Infinity };

let root;
let browser;
let origin;
const processes = [];

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'crudui-pipeline-'));
  const publicDirectory = path.join(root, 'public');
  const dataDirectory = path.join(root, 'data');
  await mkdir(dataDirectory, { recursive: true });
  const prepared = await prepareRecordServers({ buildDirectory: path.join(root, 'bin') });
  const [build] = await runStages([[{
    id: 'public-build', timeoutMs: publicBuildLimitMs, command: process.execPath,
    args: [path.join(exampleDirectory, 'build.mjs'), publicDirectory], cwd: repositoryRoot, environment: {},
  }]], { label: 'local-servers' });
  assert.equal(build.status, 'passed', `public build ${build.status}`);
  const source = await sourceIdentity(repositoryRoot);
  await writeFile(path.join(publicDirectory, 'source.json'), JSON.stringify(source) + '\n');
  const ports = {};
  const definitions = [];
  for (const server of recordServers.filter(name => name !== 'js')) {
    const definition = await recordServerProcess(server, { port: await freePort(), dataDirectory, publicDirectory, prepared });
    definitions.push(definition);
    ports[server] = Number(definition.address.split(':')[1]);
  }
  const publicServer = publicServerDefinition({ port: await freePort(), dataDirectory, publicDirectory, ports });
  // Every process holds the start limit; the public server forwards to the others only per request.
  const started = await Promise.allSettled([
    ...definitions.map(definition => startProcess(definition)),
    startProcess(publicServer, { ipc: true, message: { status: 'ready', cycle: 1, source, error: null } }),
  ]);
  processes.push(...started.filter(result => result.status === 'fulfilled').map(result => result.value));
  const failed = started.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
  origin = processes.at(-1).origin;
}, stackHook);

before(async () => {
  browser = await puppeteer.launch({ headless: true, protocolTimeout: pipelineUnitLimitMs });
}, { timeout: browserUnitLimitsMs['browser-start'] });

// A stop waits up to 2 s before it kills a process tree; the processes stop at the same time.
const stopLimitMs = 10_000;

after(async () => { await browser?.close(); }, { timeout: browserUnitLimitsMs['browser-close'] });
after(async () => { await Promise.all(processes.map(running => running.stop())); }, { timeout: stopLimitMs });
after(async () => { if (root) await rm(root, { recursive: true, force: true }); }, { timeout: stopLimitMs });

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
