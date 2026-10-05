#!/usr/bin/env node
/*
 * Build and pack a workspace package under the holder lock of its `dist` directory
 * (docs/operations/testing.md, "Shared resources").
 *
 * A package build empties `dist` before it writes the new output, and a pack reads `dist`. Both run
 * under the checkout lock `dist-<package folder>` (scripts/holder-lock.mjs), so a pack never reads a
 * `dist` that a build has emptied or only partly written; a run that finds the lock held is refused
 * with the holder's record.
 *
 *   node ../../scripts/package-dist.mjs build '<build command>'    (the package's build script)
 *   node scripts/package-dist.mjs pack <package directory> <destination directory>
 *
 * `pack` prints the JSON report of `npm pack` on standard output; the lock lines and npm's own
 * messages go to standard error.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  acquireReported, checkoutLockFile, holdWhileRunning, repositoryRoot, runCommand,
} from './holder-lock.mjs';

/** The folder of a package directory of this checkout. */
function packageFolder(directory) {
  assert.ok(path.isAbsolute(directory), `Package directory must be absolute: ${directory}`);
  assert.equal(path.dirname(directory), path.join(repositoryRoot, 'packages'),
    `${directory} is not a package directory of ${repositoryRoot}`);
  assert.ok(fs.lstatSync(directory).isDirectory(), `${directory} is not a directory`);
  return path.basename(directory);
}

const distLockFile = folder => checkoutLockFile(`dist-${folder}`);

async function build(command) {
  const folder = packageFolder(process.cwd());
  return holdWhileRunning(distLockFile(folder), '/bin/sh', ['-c', command]);
}

async function pack(directory, destination) {
  const folder = packageFolder(directory);
  assert.ok(path.isAbsolute(destination), `Pack destination must be absolute: ${destination}`);
  const lock = acquireReported(distLockFile(folder), { command: `pack ${directory}` });
  try {
    const dist = path.join(directory, 'dist');
    assert.ok(fs.existsSync(dist) && fs.readdirSync(dist).length > 0,
      `${dist} holds no build output; build the package first`);
    return await runCommand('npm', ['pack', '.', '--json', '--pack-destination', destination,
      '--workspaces=false'], { cwd: directory });
  } finally {
    lock.release();
  }
}

async function main(argv) {
  const [operation, ...args] = argv;
  if (operation === 'build' && args.length === 1) return build(args[0]);
  if (operation === 'pack' && args.length === 2) return pack(args[0], args[1]);
  throw new Error("Usage: node ../../scripts/package-dist.mjs build '<build command>'\n"
    + '       node scripts/package-dist.mjs pack <package directory> <destination directory>');
}

main(process.argv.slice(2)).then(status => { process.exitCode = status; }, error => {
  process.stderr.write(`package-dist: ${error.message}\n`);
  process.exitCode = 1;
});
