import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, createReadStream, openSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const orderedJsonRevision =
  '7a2b4682f002f73b6c44e77012d39ff199c9331d';
export const orderedJsonSubmodules = Object.freeze({
  go: '2588cbd59b442e9c7231a1b8d945a16142851141',
  js: 'd3b1f3473ce2645c79c772940df622c4d8b0bca7',
  php: '2571dacad60affcc299972474b53f2b9e6848967',
  'php-extension': '1dcb0cff184a0618de810febfe651a50b2a06cd0',
  rust: '266ab5c95d7095342521701994462c9f057cde1b',
});

export function readGitArchiveCommit(archiveFile, execute = spawnSync) {
  const descriptor = openSync(archiveFile, 'r');
  try {
    const result = execute('git', ['get-tar-commit-id'], {
      stdio: [descriptor, 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    if (result.error || result.signal || result.status !== 0) {
      throw new Error('Cannot read the candidate source archive commit');
    }
    const commit = result.stdout.trim();
    if (!/^[a-f0-9]{40}$/.test(commit)) {
      throw new Error('The candidate source archive does not identify a commit');
    }
    return commit;
  } finally {
    closeSync(descriptor);
  }
}

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function requireDigest(file, expected, name) {
  if (!/^[a-f0-9]{64}$/.test(expected ?? '') || await sha256(file) !== expected) {
    throw new Error(`${name} archive hash differs from metadata`);
  }
}

/** Verify one immutable candidate context before extracting its source archives. */
export async function verifyCandidateContext(directory, execute = spawnSync) {
  const metadata = JSON.parse(await readFile(path.join(directory, 'metadata.json'), 'utf8'));
  const sourceCommit = (await readFile(path.join(directory, 'source-commit'), 'utf8')).trim();
  const sourceArchive = path.join(directory, 'source.tar');
  const embeddedCommit = readGitArchiveCommit(sourceArchive, execute);
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)
      || metadata.source?.commit !== sourceCommit
      || embeddedCommit !== sourceCommit) {
    throw new Error('Candidate source commit differs from metadata');
  }
  await requireDigest(sourceArchive, metadata.source?.archiveSha256, 'Candidate source');

  if (metadata.orderedJson?.commit !== orderedJsonRevision) {
    throw new Error('OrderedJSON common commit differs from the required revision');
  }
  await requireDigest(path.join(directory, 'ordered-json.tar'),
    metadata.orderedJson?.archiveSha256, 'OrderedJSON');

  const submodules = metadata.orderedJson?.submodules ?? {};
  const expectedNames = Object.keys(orderedJsonSubmodules).sort();
  if (JSON.stringify(Object.keys(submodules).sort()) !== JSON.stringify(expectedNames)) {
    throw new Error('OrderedJSON metadata must contain the five implementation archives');
  }
  for (const name of expectedNames) {
    if (submodules[name]?.commit !== orderedJsonSubmodules[name]) {
      throw new Error(`OrderedJSON implementation commit differs: ${name}`);
    }
    await requireDigest(path.join(directory, `ordered-json-${name}.tar`),
      submodules[name].archiveSha256, `OrderedJSON implementation ${name}`);
  }
  return metadata;
}

if (process.argv[1]
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 3) {
    throw new Error('Usage: node verify-candidate-context.mjs [context-directory]');
  }
  await verifyCandidateContext(path.resolve(process.argv[2] ?? '/archives'));
}
