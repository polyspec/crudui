import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { packPackage } from '../../scripts/package-install-pack.mjs';

test('package install packs the current package without workspace selection', () => {
  const source = path.resolve('/repository/packages/generator-core');
  const destination = path.resolve('/temporary/install');
  const calls = [];
  const archive = packPackage(
    source, destination, '@crudui/generator-core', (command, args, cwd) => {
    calls.push({ command, args, cwd });
    return JSON.stringify([{
      name: '@crudui/generator-core',
      filename: 'crudui-generator-core-0.0.1.tgz',
    }]);
  });

  assert.equal(archive, path.join(destination, 'crudui-generator-core-0.0.1.tgz'));
  assert.deepEqual(calls, [{
    command: 'npm',
    args: ['pack', '.', '--json', '--pack-destination', destination, '--workspaces=false'],
    cwd: source,
  }]);
});

test('package install rejects an empty npm pack report', () => {
  assert.throws(
    () => packPackage('/repository/package', '/temporary/install',
      '@crudui/package', () => '[]'),
    /npm pack must produce one archive; received 0/,
  );
});
