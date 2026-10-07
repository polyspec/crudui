import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, readlink } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const gitOptions = ['-c', 'core.quotepath=off'];
const commitPattern = /^[0-9a-f]{40}$/;
// Operator-local editor settings are per-checkout state, not comparison source.
const localOnlyPaths = new Set(['.claude/settings.local.json']);

async function git(root, args) {
  const { stdout } = await execFileAsync('git', [...gitOptions, ...args], {
    cwd: root, encoding: 'buffer', maxBuffer: 256 * 1024 * 1024,
  });
  return stdout;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function lstatOrNull(file) {
  try {
    return await lstat(file);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
}

/** Return the checked-out commit of one repository. */
export async function headCommit(root) {
  const commit = (await git(root, ['rev-parse', '--verify', 'HEAD^{commit}']))
    .toString('utf8').trim();
  if (!commitPattern.test(commit)) throw new Error('Cannot read the checked-out commit');
  return commit;
}

/** Return every path that differs from the checked-out commit, including untracked files. */
export async function uncommittedPaths(root) {
  const output = await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all',
    '--no-renames', '--ignore-submodules=none']);
  // Each entry is two status letters, one space and the path.
  return [...new Set(output.toString('utf8').split('\0').filter(Boolean)
    .map(entry => entry.slice(3)).filter(file => !localOnlyPaths.has(file)))].sort();
}

async function contentDigest(file) {
  const state = await lstatOrNull(file);
  if (!state) return 'deleted';
  if (state.isSymbolicLink()) return 'link:' + sha256(await readlink(file));
  if (!state.isFile()) throw new Error('Unsupported source entry: ' + file);
  return (state.mode & 0o111 ? 'executable:' : 'file:') + sha256(await readFile(file));
}

/**
 * Identify one working tree by its commit and a SHA-256 digest of every uncommitted path and
 * its content. A tree without uncommitted changes has `changes: null`.
 */
export async function sourceIdentity(root) {
  const [commit, paths] = await Promise.all([headCommit(root), uncommittedPaths(root)]);
  if (paths.length === 0) return { commit, changes: null };
  const hash = createHash('sha256');
  for (const file of paths) {
    hash.update(file + '\0' + await contentDigest(path.join(root, file)) + '\n');
  }
  return { commit, changes: hash.digest('hex') };
}
