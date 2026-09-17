// Source-level HTTP contract of the five record stores (docs/spec/form-comparison.md, "Record
// resource"). Every server is built and started from this checkout with its own port, data
// directory and public directory, and runs the same contract cases.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import { freePort, prepareRecordServers, recordPublicDirectory, recordServerProcess, startProcess } from './src/local-servers.mjs';
import { recordClient, recordContractCases, recordServers, recordStoreName } from './src/record-contract.mjs';

// The preparation is the checkout and the parallel builds. Every operation in it holds its own limit
// and prints its progress, so the hook that runs them has no limit of its own.
const preparationHook = { timeout: Infinity };
// One contract case, including a server restart; the process start alone measured 79 to 96 ms.
const caseLimitMs = 20_000;

let root;
let prepared;
let publicDirectory;

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'crudui-record-stores-'));
  publicDirectory = await recordPublicDirectory(path.join(root, 'public'));
  prepared = await prepareRecordServers({ buildDirectory: path.join(root, 'bin') });
}, preparationHook);

after(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

for (const server of recordServers) {
  describe(`${server} record store`, () => {
    let running;
    let client;
    const dataDirectory = () => path.join(root, `data-${server}`);
    async function start() {
      const definition = await recordServerProcess(server, {
        port: await freePort(), dataDirectory: dataDirectory(), publicDirectory, prepared,
      });
      running = await startProcess(definition);
    }
    before(async () => {
      await mkdir(dataDirectory(), { recursive: true });
      await start();
      client = recordClient({
        origin: () => running.origin, server,
        storeFile: path.join(dataDirectory(), recordStoreName(server)),
        restart: async () => { await running.stop(); await start(); },
      });
    }, { timeout: 60_000 });
    after(async () => { await running?.stop(); });

    for (const contractCase of recordContractCases) {
      test(contractCase.id, { timeout: caseLimitMs }, async () => {
        assert.ok(client, `${server} did not start`);
        await contractCase.run(client);
      });
    }
  });
}
