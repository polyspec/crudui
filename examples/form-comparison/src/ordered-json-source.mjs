import { execFile } from 'node:child_process';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const orderedJsonRepository = 'https://github.com/polyspec/ordered-json';
export const orderedJsonVersion = '0.0.1';
export const orderedJsonBranch = 'main';
export const orderedJsonPackages = Object.freeze({
  go: 'go/go.mod',
  js: 'js/package.json',
  php: 'php/composer.json',
  'php-extension': 'php-extension/composer.json',
  rust: 'rust/Cargo.toml',
});

async function defaultGit(directory, args) {
  const { stdout } = await execFileAsync('git', args, {
    cwd: directory, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

/**
 * Check out the head of the OrderedJSON monorepo branch `main`. Required language packages must
 * exist in that tree; the PHP extension build adds only untracked outputs. The checkout is made in a
 * directory of this process beside `directory` and renamed into place when it is complete, so a
 * reader finds the previous checkout or the new one, never a partial tree; a failed checkout leaves
 * the previous one.
 */
export async function installOrderedJson(directory, git = defaultGit) {
  if (!path.isAbsolute(directory)) throw new Error('OrderedJSON needs an absolute directory');
  const next = `${directory}.next-${process.pid}`;
  // A fresh directory, so no Git index or ignored file of an older checkout remains.
  await rm(next, { recursive: true, force: true });
  await mkdir(next, { recursive: true });
  try {
    await git(next, ['init', '--quiet']);
    await git(next, ['fetch', '--quiet', '--depth=1', orderedJsonRepository, orderedJsonBranch]);
    await git(next, ['checkout', '--quiet', '--detach', 'FETCH_HEAD']);
    const changes = await git(next, ['status', '--porcelain', '--untracked-files=no',
      '--no-renames']);
    if (changes.trim()) throw new Error('The OrderedJSON checkout contains tracked changes');
    for (const [name, file] of Object.entries(orderedJsonPackages)) {
      try {
        await git(next, ['cat-file', '-e', 'HEAD:' + file]);
      } catch {
        throw new Error(`OrderedJSON package is missing from the monorepo branch ${orderedJsonBranch}: ${name}`);
      }
    }
    const old = `${directory}.old-${process.pid}`;
    const present = await stat(directory).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
    if (present) await rename(directory, old);
    await rename(next, directory);
    await rm(old, { recursive: true, force: true });
  } finally {
    await rm(next, { recursive: true, force: true });
  }
  return { repository: orderedJsonRepository, version: orderedJsonVersion, branch: orderedJsonBranch,
    packages: { ...orderedJsonPackages } };
}
