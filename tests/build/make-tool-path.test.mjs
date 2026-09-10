import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repository = path.resolve(import.meta.dirname, '../..');
const make = process.env.MAKE || '/usr/bin/make';

async function writeExecutable(filename) {
  await writeFile(filename, [
    '#!/bin/sh',
    'printf \'%s\t%s\n\' "${0##*/}" "$*" >> "$COMMAND_LOG"',
    '',
  ].join('\n'));
  await chmod(filename, 0o755);
}

test('test-native resolves Cargo from the path exported by the Makefile', {
  skip: process.platform === 'win32',
}, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-make-path-'));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const home = path.join(directory, 'home');
  const cargoDirectory = path.join(home, '.cargo', 'bin');
  const commandDirectory = path.join(directory, 'commands');
  const commandLog = path.join(directory, 'commands.log');
  await mkdir(cargoDirectory, { recursive: true });
  await mkdir(commandDirectory);

  await Promise.all([
    ...['composer', 'go', 'node', 'npm', 'sh'].map(command => (
      writeExecutable(path.join(commandDirectory, command))
    )),
    writeExecutable(path.join(cargoDirectory, 'cargo')),
  ]);

  const result = spawnSync(make, ['--no-print-directory', '-f', 'Makefile', 'test-native'], {
    cwd: repository,
    encoding: 'utf8',
    env: {
      COMMAND_LOG: commandLog,
      HOME: home,
      LANG: 'C',
      LC_ALL: 'C',
      PATH: `${commandDirectory}:/usr/bin:/bin`,
    },
  });

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, [result.stdout, result.stderr].join('\n'));
  const commands = await readFile(commandLog, 'utf8');
  assert.match(commands,
    /^cargo\ttest --locked --manifest-path packages\/generator-rust\/Cargo\.toml$/m);
});
