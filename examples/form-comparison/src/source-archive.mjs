import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

function git(repository, args, options = {}) {
  return execFileSync('git', args, {
    cwd: repository,
    maxBuffer: 100 * 1024 * 1024,
    ...options,
  });
}

/** Create one complete source archive from an exact clean repository commit. */
export function archiveRepositorySource(repository, reference) {
  const changes = git(repository, ['status', '--porcelain', '--untracked-files=all'],
    { encoding: 'utf8' }).trim();
  if (changes) throw new Error('The repository contains tracked or untracked changes');

  let commit;
  try {
    commit = git(repository, ['rev-parse', '--verify', `${reference}^{commit}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    throw new Error(`Cannot resolve source commit: ${reference}`);
  }
  const archive = git(repository, ['archive', commit]);
  return {
    commit,
    archive,
    archiveSha256: createHash('sha256').update(archive).digest('hex'),
  };
}

/** Read one file from the recorded repository commit. */
export function readRepositorySourceFile(repository, commit, file) {
  return git(repository, ['show', `${commit}:${file}`]);
}
