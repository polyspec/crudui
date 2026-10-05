import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { acquireHolderLock } from '../../scripts/holder-lock.mjs';

const root = path.resolve(import.meta.dirname, '../..');
/** Run a deployment program without a container runtime on PATH, so nothing reaches a container. */
function runDeploymentProgram(program, home) {
  return spawnSync(process.execPath, [path.join(import.meta.dirname, program)],
    { cwd: root, env: { HOME: home, PATH: '/usr/bin:/bin' }, encoding: 'utf8' });
}

for (const program of ['comparison-deployment.mjs', 'verification.mjs']) {
  test(`${program} takes the deployment lock before any other step`, () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'crudui-deployment-lock-'));
    try {
      const file = path.join(home, '.local/state/crudui/locks/form-comparison-deployment.lock');
      const lock = acquireHolderLock(file, { command: 'make deploy' });
      const refused = runDeploymentProgram(program, home);
      assert.equal(refused.status, 1, refused.stderr);
      assert.match(refused.stderr, new RegExp(`${file} is held by pid ${process.pid} \\(process started `));
      lock.release();
      const free = runDeploymentProgram(program, home);
      assert.equal(free.status, 1, 'Without a container runtime the program fails after taking the lock');
      assert.doesNotMatch(free.stderr, /is held by/);
      assert.match(free.stderr, new RegExp(`lock: released ${file}`));
      assert.equal(fs.existsSync(file), false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
}
