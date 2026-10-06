import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { packPackage, packReport } from '../../scripts/package-install-pack.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');

/** A package directory whose manifest names the package, as packPackage reads it. */
function packageSource(name) {
  const directory = mkdtempSync(path.join(tmpdir(), 'crudui-pack-source-'));
  writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name }));
  return directory;
}

test('package install packs a package under the lock of its dist', async () => {
  const source = packageSource('@polyspec/crudui-generator-core');
  const destination = path.resolve('/temporary/install');
  const calls = [];
  try {
    const archive = await packPackage(
      source, destination, '@polyspec/crudui-generator-core', async (command, args, cwd) => {
      calls.push({ command, args, cwd });
      return JSON.stringify([{
        name: '@polyspec/crudui-generator-core',
        filename: 'polyspec-crudui-generator-core-0.0.1.tgz',
      }]);
    });

    assert.equal(archive, path.join(destination, 'polyspec-crudui-generator-core-0.0.1.tgz'));
    assert.deepEqual(calls, [{
      command: process.execPath,
      args: [path.join(repositoryRoot, 'scripts/package-dist.mjs'), 'pack', source, destination],
      cwd: repositoryRoot,
    }]);
  } finally {
    rmSync(source, { recursive: true, force: true });
  }
});

test('package install rejects an empty npm pack report', async () => {
  const source = packageSource('@polyspec/crudui-package');
  try {
    await assert.rejects(
      () => packPackage(source, '/temporary/install', '@polyspec/crudui-package', async () => '[]'),
      /npm pack must produce one archive of @polyspec\/crudui-package; received 0/,
    );
  } finally {
    rmSync(source, { recursive: true, force: true });
  }
});

test('the npm pack report is read from the array of npm 11 and the object of npm 12', () => {
  const report = { id: '@polyspec/crudui-package@1.0.0', name: '@polyspec/crudui-package', filename: 'crudui-package-1.0.0.tgz', files: [] };
  assert.deepEqual(packReport(JSON.stringify([report]), '@polyspec/crudui-package'), report);
  assert.deepEqual(packReport(JSON.stringify({ '@polyspec/crudui-package': report }), '@polyspec/crudui-package'), report);
  assert.throws(() => packReport(JSON.stringify({ '@polyspec/crudui-other': { ...report, name: '@polyspec/crudui-other' } }), '@polyspec/crudui-package'),
    /npm pack report name must match the package name/);
});
