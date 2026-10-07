import { execFile } from 'node:child_process';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const orderedJsonRepository = 'https://github.com/polyspec/ordered-json';
export const orderedJsonVersion = '0.0.1';
export const orderedJsonTag = `v${orderedJsonVersion}`;
/** The checkout of the tag, relative to the repository root; the root package.json links its js package. */
export const orderedJsonCheckout = '.form-comparison/sources/ordered-json';
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

/** The local ref of the tag in a checkout that `installOrderedJson` made. */
const tagRef = `refs/tags/${orderedJsonTag}`;

/**
 * Whether `directory` holds an OrderedJSON checkout of the tag `orderedJsonTag` without tracked
 * changes: its HEAD is the commit of the tag ref that the installer fetched into it. A missing
 * checkout, a checkout without that tag ref and a checkout at another commit are not accepted.
 */
export async function orderedJsonAtTag(directory, git = defaultGit) {
  try {
    const head = (await git(directory, ['rev-parse', '--verify', 'HEAD^{commit}'])).trim();
    const tag = (await git(directory, ['rev-parse', '--verify', `${tagRef}^{commit}`])).trim();
    if (!head || head !== tag) return false;
    const changes = await git(directory, ['status', '--porcelain', '--untracked-files=no']);
    return changes.trim() === '';
  } catch {
    return false;
  }
}

/**
 * Check out the tag `orderedJsonTag` of the OrderedJSON monorepo. A checkout that is already at the
 * commit of the tag without tracked changes stays; any other one is replaced. Required language
 * packages must exist in that tree; the PHP extension build adds only untracked outputs. The
 * checkout is made in a directory of this process beside `directory` and renamed into place when it
 * is complete, so a reader finds the previous checkout or the new one, never a partial tree; a
 * failed checkout leaves the previous one.
 */
export async function installOrderedJson(directory, git = defaultGit) {
  if (!path.isAbsolute(directory)) throw new Error('OrderedJSON needs an absolute directory');
  const result = { repository: orderedJsonRepository, version: orderedJsonVersion, tag: orderedJsonTag,
    packages: { ...orderedJsonPackages } };
  const exists = () => stat(directory).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
  if (await exists() && await orderedJsonAtTag(directory, git)) return { ...result, installed: false };
  const next = `${directory}.next-${process.pid}`;
  // A fresh directory, so no Git index or ignored file of an older checkout remains.
  await rm(next, { recursive: true, force: true });
  await mkdir(next, { recursive: true });
  try {
    await git(next, ['init', '--quiet']);
    await git(next, ['fetch', '--quiet', '--depth=1', '--no-tags', orderedJsonRepository,
      `+${tagRef}:${tagRef}`]);
    await git(next, ['checkout', '--quiet', '--detach', `${tagRef}^{commit}`]);
    if (!await orderedJsonAtTag(next, git)) {
      throw new Error(`The OrderedJSON checkout is not at the commit of the tag ${orderedJsonTag} or contains tracked changes`);
    }
    for (const [name, file] of Object.entries(orderedJsonPackages)) {
      try {
        await git(next, ['cat-file', '-e', 'HEAD:' + file]);
      } catch {
        throw new Error(`OrderedJSON package is missing from the monorepo tag ${orderedJsonTag}: ${name}`);
      }
    }
    const old = `${directory}.old-${process.pid}`;
    if (await exists()) await rename(directory, old);
    await rename(next, directory);
    await rm(old, { recursive: true, force: true });
  } finally {
    await rm(next, { recursive: true, force: true });
  }
  return { ...result, installed: true };
}
