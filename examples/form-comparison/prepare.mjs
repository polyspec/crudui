import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { archiveRepositorySource, readRepositorySourceFile } from './src/source-archive.mjs';

const exampleDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(exampleDirectory, '../..');
const orderedJsonRevision = '7a2b4682f002f73b6c44e77012d39ff199c9331d';
const orderedJsonRepository = 'https://github.com/ordered-json/ordered-json';
const implementationPaths = Object.freeze(['go', 'js', 'php', 'php-extension', 'rust']);
export const requiredSourcePaths = Object.freeze([
  'package.json',
  'package-lock.json',
  'examples/form-comparison/Containerfile',
  'examples/form-comparison/verify-candidate-context.mjs',
  'packages/generator-php/composer.json',
  'packages/generator-php/composer.lock',
  'packages/validator-php/composer.json',
  'packages/validator-php/composer.lock',
  'packages/generator-go/go.mod',
  'packages/generator-rust/Cargo.toml',
  'packages/generator-rust/Cargo.lock',
  'scripts/tool-resolution.mjs',
  'scripts/php-extension-builder.mjs',
  'scripts/build-crudui-php-extension.mjs',
  'scripts/build-ordered-json-php-extension.mjs',
]);

function git(repository, args, options = {}) {
  return execFileSync('git', args, {
    cwd: repository,
    maxBuffer: 100 * 1024 * 1024,
    ...options,
  });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function currentCommit(repository) {
  return git(repository, ['rev-parse', '--verify', 'HEAD^{commit}'], {
    encoding: 'utf8',
  }).trim();
}

async function sameFiles(directory, files) {
  let names;
  try {
    names = (await readdir(directory)).sort();
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  const expected = [...files.keys()].sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) return false;
  for (const name of expected) {
    if (!(await readFile(path.join(directory, name))).equals(files.get(name))) return false;
  }
  return true;
}

async function installContext(directory, files) {
  if (await sameFiles(directory, files)) return;
  try {
    await readdir(directory);
    throw new Error('Candidate context differs for the same source commit: ' + directory);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const parent = path.dirname(directory);
  await mkdir(parent, { recursive: true });
  const temporary = await mkdtemp(path.join(parent, '.prepare-'));
  try {
    await Promise.all([...files].map(([name, value]) =>
      writeFile(path.join(temporary, name), value)));
    await rename(temporary, directory);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

async function checkoutOrderedJson(cacheDirectory) {
  await mkdir(cacheDirectory, { recursive: true });
  const source = path.join(cacheDirectory, 'ordered-json');
  execFileSync('git', ['init', '--quiet', source]);
  try {
    git(source, ['cat-file', '-e', orderedJsonRevision + '^{commit}'], { stdio: 'ignore' });
  } catch {
    git(source, ['fetch', '--quiet', '--depth=1', orderedJsonRepository, orderedJsonRevision]);
  }
  git(source, ['checkout', '--quiet', '--detach', orderedJsonRevision]);
  git(source, ['submodule', 'update', '--init', '--recursive']);
  const changes = git(source,
    ['status', '--porcelain', '--untracked-files=all', '--ignore-submodules=none'],
    { encoding: 'utf8' }).trim();
  if (changes) throw new Error('The OrderedJSON source cache contains changes');
  return source;
}

export async function archiveOrderedJson(cacheDirectory) {
  const source = await checkoutOrderedJson(cacheDirectory);
  const archive = git(source, ['archive', orderedJsonRevision]);
  const registry = JSON.parse(git(source,
    ['show', orderedJsonRevision + ':implementations.json'], { encoding: 'utf8' }));
  const entries = Object.values(registry.repositories)
    .sort((left, right) => left.path.localeCompare(right.path));
  if (JSON.stringify(entries.map(entry => entry.path)) !== JSON.stringify(implementationPaths)) {
    throw new Error('OrderedJSON must contain the five pinned implementation sources');
  }
  const files = new Map([['ordered-json.tar', archive]]);
  const submodules = {};
  for (const entry of entries) {
    const module = path.join(source, entry.path);
    const commit = git(module, ['rev-parse', '--verify', 'HEAD^{commit}'], {
      encoding: 'utf8',
    }).trim();
    const expected = git(source, ['rev-parse', orderedJsonRevision + ':' + entry.path], {
      encoding: 'utf8',
    }).trim();
    const changes = git(module, ['status', '--porcelain', '--untracked-files=all'], {
      encoding: 'utf8',
    }).trim();
    if (commit !== expected || changes) {
      throw new Error('OrderedJSON implementation differs: ' + entry.path);
    }
    const content = git(module, ['archive', '--prefix=' + entry.path + '/', commit]);
    files.set('ordered-json-' + entry.path + '.tar', content);
    submodules[entry.path] = {
      repository: entry.url,
      commit,
      archiveSha256: sha256(content),
    };
  }
  return {
    files,
    metadata: {
      repository: orderedJsonRepository,
      commit: orderedJsonRevision,
      archiveSha256: sha256(archive),
      submodules,
    },
  };
}

/** Prepare one immutable build context from the current committed repository source. */
export async function prepareCandidate({ repository, reference, workDirectory,
  orderedJson = archiveOrderedJson }) {
  if (!path.isAbsolute(repository) || !path.isAbsolute(workDirectory)) {
    throw new Error('Absolute repository and work paths are required');
  }
  const source = archiveRepositorySource(repository, reference);
  if (source.commit !== currentCommit(repository)) {
    throw new Error('The candidate source commit must be the current HEAD');
  }
  for (const file of requiredSourcePaths) {
    try {
      git(repository, ['cat-file', '-e', source.commit + ':' + file], { stdio: 'ignore' });
    } catch {
      throw new Error('Candidate source is missing required file: ' + file);
    }
  }
  const dependency = await orderedJson(path.join(workDirectory, 'sources'));
  const metadata = {
    source: { commit: source.commit, archiveSha256: source.archiveSha256 },
    orderedJson: dependency.metadata,
  };
  const files = new Map([
    ['Containerfile', readRepositorySourceFile(repository, source.commit,
      'examples/form-comparison/Containerfile')],
    ['verify-candidate-context.mjs', readRepositorySourceFile(repository, source.commit,
      'examples/form-comparison/verify-candidate-context.mjs')],
    ['source.tar', source.archive],
    ['source-commit', Buffer.from(source.commit + '\n')],
    ['metadata.json', Buffer.from(JSON.stringify(metadata, null, 2) + '\n')],
    ...dependency.files,
  ]);
  const candidate = path.join(workDirectory, 'candidates', source.commit);
  const context = path.join(candidate, 'context');
  await installContext(context, files);
  await mkdir(path.join(candidate, 'data'), { recursive: true });
  await mkdir(path.join(candidate, 'results'), { recursive: true });
  return { candidate, context, metadata };
}

function parseArguments(values) {
  if (values.length !== 2 || values[0] !== '--ref' || !values[1]) {
    throw new Error('Usage: node examples/form-comparison/prepare.mjs --ref commit');
  }
  return values[1];
}

async function main() {
  const result = await prepareCandidate({
    repository: repositoryRoot,
    reference: parseArguments(process.argv.slice(2)),
    workDirectory: path.join(repositoryRoot, '.form-comparison'),
  });
  process.stdout.write(JSON.stringify({
    source: result.metadata.source,
    context: path.relative(repositoryRoot, result.context),
    data: path.relative(repositoryRoot, path.join(result.candidate, 'data')),
    results: path.relative(repositoryRoot, path.join(result.candidate, 'results')),
  }, null, 2) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
