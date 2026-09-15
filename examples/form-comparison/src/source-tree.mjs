import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod, copyFile, lstat, mkdir, readFile, readlink, rename, rm, symlink, utimes, writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
// The host and a container see the same files with different inode, device and change times,
// so Git compares only modification time and size before it compares content.
const gitOptions = ['-c', 'core.checkStat=minimal', '-c', 'core.trustctime=false',
  '-c', 'core.quotepath=off'];
const commitPattern = /^[0-9a-f]{40}$/;
// Claude's per-checkout settings are operator-local state, not comparison source.
const localOnlyPaths = new Set(['.claude/settings.local.json']);

/** One comparison of the mounted repository runs every second, so its Git calls are bounded. */
export const sourceGitTimeoutMs = 120_000;

async function git(root, args) {
  const { stdout } = await execFileAsync('git', [...gitOptions, ...args], {
    cwd: root, encoding: 'buffer', maxBuffer: 256 * 1024 * 1024,
    timeout: sourceGitTimeoutMs, killSignal: 'SIGKILL',
  });
  return stdout;
}

function pathList(output) {
  return [...new Set(output.toString('utf8').split('\0').filter(Boolean))].sort();
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

function assertRepositoryPath(file) {
  if (typeof file !== 'string' || file === '' || path.isAbsolute(file)
      || path.posix.normalize(file) !== file || file.split('/').includes('..')) {
    throw new Error('Expected a normalized repository path: ' + file);
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

/** Return the files Git shows in the working tree: tracked files and untracked, unignored files. */
export async function listSourceFiles(root) {
  return pathList(await git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']))
    .filter(file => !localOnlyPaths.has(file));
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

async function statSignature(file) {
  const state = await lstatOrNull(file);
  if (!state) return 'deleted';
  return [state.isSymbolicLink() ? 'link' : 'file', state.size, state.mtimeMs, state.mode].join(':');
}

/** Read what change detection compares: the commit and the metadata of every uncommitted path. */
export async function readTreeState(root) {
  const [commit, paths] = await Promise.all([headCommit(root), uncommittedPaths(root)]);
  const files = {};
  for (const file of paths) files[file] = await statSignature(path.join(root, file));
  return { commit, files };
}

/** Return the sorted repository paths whose content may differ between two tree states. */
export async function changedPaths(root, previous, next) {
  const paths = new Set();
  if (previous.commit !== next.commit) {
    for (const file of pathList(await git(root, ['diff', '--name-only', '-z', '--no-renames',
      previous.commit, next.commit]))) paths.add(file);
  }
  for (const file of new Set([...Object.keys(previous.files), ...Object.keys(next.files)])) {
    if (previous.files[file] !== next.files[file]) paths.add(file);
  }
  return [...paths].sort();
}

async function readManifest(file) {
  try {
    const value = JSON.parse(await readFile(file, 'utf8'));
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
      throw new Error('Malformed build tree manifest: ' + file);
    }
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeManifest(file, paths) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = file + '.' + process.pid + '.tmp';
  await writeFile(temporary, JSON.stringify([...paths].sort()) + '\n');
  await rename(temporary, file);
}

async function copyPath(source, tree, file) {
  assertRepositoryPath(file);
  const from = path.join(source, file);
  const to = path.join(tree, file);
  const state = await lstatOrNull(from);
  const existing = await lstatOrNull(to);
  if (!state) {
    if (existing) await rm(to, { recursive: true, force: true });
    return false;
  }
  if (existing?.isFile() && state.isFile() && existing.size === state.size
      && Math.trunc(existing.mtimeMs) === Math.trunc(state.mtimeMs)
      && (existing.mode & 0o777) === (state.mode & 0o777)) return true;
  await mkdir(path.dirname(to), { recursive: true });
  if (existing && !existing.isFile()) await rm(to, { recursive: true, force: true });
  if (state.isSymbolicLink()) {
    await rm(to, { force: true });
    await symlink(await readlink(from), to);
    return true;
  }
  if (!state.isFile()) throw new Error('Unsupported source entry: ' + from);
  // Replace atomically: servers read these files per request.
  const temporary = path.join(path.dirname(to), '.' + path.basename(to) + '.' + process.pid + '.sync');
  await copyFile(from, temporary);
  await chmod(temporary, state.mode & 0o777);
  await utimes(temporary, state.atime, state.mtime);
  await rename(temporary, to);
  return true;
}

/**
 * Make the build tree hold exactly the Git-visible files of the source. Build outputs, which
 * Git ignores and the manifest never lists, stay in place.
 */
export async function synchronizeTree({ source, tree, manifestFile }) {
  const files = await listSourceFiles(source);
  const listed = new Set(files);
  for (const file of await readManifest(manifestFile)) {
    if (!listed.has(file)) {
      assertRepositoryPath(file);
      await rm(path.join(tree, file), { recursive: true, force: true });
    }
  }
  const present = [];
  for (const file of files) {
    if (await copyPath(source, tree, file)) present.push(file);
  }
  await writeManifest(manifestFile, present);
  return present;
}

/** Copy or remove the given changed paths and record the result in the manifest. */
export async function applyTreeChanges({ source, tree, manifestFile, paths }) {
  const manifest = new Set(await readManifest(manifestFile));
  for (const file of paths) {
    if (await copyPath(source, tree, file)) manifest.add(file);
    else manifest.delete(file);
  }
  await writeManifest(manifestFile, manifest);
}
