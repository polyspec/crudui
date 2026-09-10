import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveContainerRuntime } from './container-runtime.mjs';

function stat(type) {
  return {
    isFile: () => type === 'file',
    isDirectory: () => type === 'directory',
    isSymbolicLink: () => type === 'symlink',
  };
}

function filesystem(overrides = {}) {
  const entries = new Map([
    ['/brew', 'directory'],
    ['/brew/bin', 'directory'],
    ['/brew/bin/brew', 'file'],
    ['/brew/Cellar', 'directory'],
    ['/brew/Cellar/container', 'directory'],
    ['/brew/Cellar/container/1.3.1', 'directory'],
    ['/brew/Cellar/container/1.3.1/libexec', 'directory'],
    ['/brew/Cellar/container/1.3.1/libexec/container', 'file'],
    ...Object.entries(overrides),
  ]);
  return async file => {
    const type = entries.get(file);
    if (!type) throw Object.assign(new Error('missing: ' + file), { code: 'ENOENT' });
    return stat(type);
  };
}

function packageCommands(installed = [{ version: '1.3.1' }]) {
  const calls = [];
  return {
    calls,
    execute: async (file, args) => {
      calls.push([file, args]);
      if (args[0] === 'info') {
        return { stdout: JSON.stringify({
          formulae: [{ name: 'container', linked_keg: '1.3.1', installed }],
          casks: [],
        }) };
      }
      if (args[0] === '--cellar') return { stdout: '/brew/Cellar/container\n' };
      throw new Error('unexpected package command');
    },
  };
}

test('resolves one regular executable from one installed package record', async () => {
  const commands = packageCommands();
  const runtime = await resolveContainerRuntime({
    environment: { PATH: '/missing:/brew/bin:/brew/bin' },
    lstatFile: filesystem(),
    accessFile: async () => {},
    execute: commands.execute,
  });
  assert.deepEqual(runtime, {
    executable: '/brew/Cellar/container/1.3.1/libexec/container',
    environment: { CONTAINER_INSTALL_ROOT: '/brew/Cellar/container/1.3.1' },
  });
  assert.deepEqual(commands.calls, [
    ['/brew/bin/brew', ['info', '--json=v2', 'container']],
    ['/brew/bin/brew', ['--cellar', 'container']],
  ]);
});

test('rejects a relative PATH entry before package discovery', async () => {
  await assert.rejects(resolveContainerRuntime({
    environment: { PATH: 'relative/bin:/brew/bin' },
    lstatFile: filesystem(),
  }), /PATH entries must be absolute/);
});

test('rejects symbolic and ambiguous package-manager executables', async () => {
  await assert.rejects(resolveContainerRuntime({
    environment: { PATH: '/linked:/brew/bin' },
    lstatFile: filesystem({ '/linked': 'directory', '/linked/brew': 'symlink' }),
    accessFile: async () => {},
  }), /symbolic links are not allowed/);
  await assert.rejects(resolveContainerRuntime({
    environment: { PATH: '/other:/brew/bin' },
    lstatFile: filesystem({ '/other': 'directory', '/other/brew': 'file' }),
    accessFile: async () => {},
  }), /exactly one regular brew executable/);
});

test('rejects multiple installed container versions', async () => {
  const commands = packageCommands([{ version: '1.3.1' }, { version: '1.4.1' }]);
  await assert.rejects(resolveContainerRuntime({
    environment: { PATH: '/brew/bin' },
    lstatFile: filesystem(),
    accessFile: async () => {},
    execute: commands.execute,
  }), /exactly one installed container version/);
});

test('rejects a symbolic link in the resolved runtime path', async () => {
  const commands = packageCommands();
  await assert.rejects(resolveContainerRuntime({
    environment: { PATH: '/brew/bin' },
    lstatFile: filesystem({
      '/brew/Cellar/container/1.3.1/libexec/container': 'symlink',
    }),
    accessFile: async () => {},
    execute: commands.execute,
  }), /symbolic links are not allowed/);
});
