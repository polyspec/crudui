import { execFile } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const orderedJsonRepository = 'https://github.com/polyspec/ordered-json';
export const orderedJsonVersion = '0.0.1';
export const orderedJsonRevision = '26c2aebc97896e280d3a6b8f5e8e1d85e2282b83';
export const orderedJsonPackages = Object.freeze({
  go: 'go/go.mod',
  js: 'js/package.json',
  php: 'php/composer.json',
  'php-extension': 'php-extension/composer.json',
  rust: 'rust/Cargo.toml',
});

/** A clone or fetch of the pinned sources has its own timeout, which a lost network reaches. */
export const orderedJsonGitTimeoutMs = 600_000;

async function defaultGit(directory, args) {
  const { stdout } = await execFileAsync('git', args, {
    cwd: directory, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    timeout: orderedJsonGitTimeoutMs, killSignal: 'SIGKILL',
  });
  return stdout;
}

/**
 * Check out one pinned OrderedJSON monorepo revision. Required language packages must exist in
 * that tree; the PHP extension build adds only untracked outputs.
 */
export async function installOrderedJson(directory, git = defaultGit) {
  if (!path.isAbsolute(directory)) throw new Error('OrderedJSON needs an absolute directory');
  // The named build volume may contain a checkout created by an older repository layout.
  // Recreate only this dedicated source directory so no stale Git index or ignored file remains.
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  await git(directory, ['init', '--quiet']);
  try {
    await git(directory, ['cat-file', '-e', orderedJsonRevision + '^{commit}']);
  } catch {
    await git(directory, ['fetch', '--quiet', '--depth=1', orderedJsonRepository,
      orderedJsonRevision]);
  }
  await git(directory, ['checkout', '--quiet', '--detach', orderedJsonRevision]);
  const changes = await git(directory, ['status', '--porcelain', '--untracked-files=no',
    '--no-renames']);
  if (changes.trim()) throw new Error('The OrderedJSON checkout contains tracked changes');
  for (const [name, file] of Object.entries(orderedJsonPackages)) {
    try {
      await git(directory, ['cat-file', '-e', orderedJsonRevision + ':' + file]);
    } catch {
      throw new Error(`OrderedJSON package is missing from the pinned monorepo: ${name}`);
    }
  }
  return { repository: orderedJsonRepository, version: orderedJsonVersion, commit: orderedJsonRevision,
    packages: { ...orderedJsonPackages } };
}
