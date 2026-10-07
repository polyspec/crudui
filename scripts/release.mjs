#!/usr/bin/env node
// The release of a pushed tag, run by .github/workflows/release.yml through make (AGENTS.md, "Releases"):
//
//   `node scripts/release.mjs check`     the tagged commit is on main, its check runs `push-gate` and `ci-passed`
//                                        concluded success, every package file that the tag covers has the version of
//                                        the tag, and CHANGELOG.md has the section `## X.Y.Z`
//   `node scripts/release.mjs assets`    writes the archive of every package that the tag covers to var/release/assets
//   `node scripts/release.mjs publish`   creates the GitHub Release of the tag with the section `## X.Y.Z` of
//                                        CHANGELOG.md as its notes and the archives of var/release/assets
//
// The tag, the commit and the repository come from GITHUB_REF_NAME, GITHUB_SHA and GITHUB_REPOSITORY. A tag `vX.Y.Z`
// covers every package.json, composer.json, Cargo.toml, VERSION and pyproject.toml of the repository; a tag
// `<directory>/vX.Y.Z` names the Go module of that directory and covers the package files inside it. The archives are
// `<package>-<version>.tgz` from `npm pack`, `<vendor>-<package>-<version>.zip` from `git archive` of a Composer
// package directory and `<crate>-<version>.crate` from `cargo package` of every package of `packages/` that is not
// private; a Go module needs no archive. The checks do not run the tests again: the check runs of the commit hold them.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { packReport } from './package-install-pack.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
export const REQUIRED_CHECKS = ['push-gate', 'ci-passed'];
export const PACKAGE_FILES = ['package.json', 'composer.json', 'Cargo.toml', 'VERSION', 'pyproject.toml'];
const OUTPUT = 'var/release';
const USAGE = 'Usage: node scripts/release.mjs check | assets | publish (with GITHUB_REF_NAME, GITHUB_SHA and GITHUB_REPOSITORY)';

/** The parts of a release tag: `vX.Y.Z` or `<directory>/vX.Y.Z`. */
export function parseTag(tag) {
  const match = /^(?:(.+)\/)?v(\d+\.\d+\.\d+)$/.exec(tag ?? '');
  if (!match) throw new Error(`the tag ${JSON.stringify(tag)} is not vX.Y.Z or <directory>/vX.Y.Z`);
  return { tag, directory: match[1] ?? '', version: match[2] };
}

/** The archive file name of a package: `@scope/` is written `scope-` and a Composer `vendor/` `vendor-`. */
export function assetName(name, version, extension) {
  return `${name.replace(/^@/, '').replace('/', '-')}-${version}.${extension}`;
}

/** The value of `key` in the table `[table]` of a TOML text, for the plain string values of package manifests. */
function tomlValue(text, table, key) {
  let current = null;
  for (const line of text.split('\n')) {
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (header) current = header[1].trim();
    else if (current === table) {
      const entry = new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`).exec(line);
      if (entry) return entry[1].replace(/^"(.*)"$/, '$1');
    }
  }
  return undefined;
}

/** The name, version and publication of a package file; a Composer manifest without `version` takes it from the tag. */
export function packageManifest(file, text) {
  const base = path.posix.basename(file);
  if (base === 'package.json' || base === 'composer.json') {
    const json = JSON.parse(text);
    return { name: json.name, version: json.version, versioned: base === 'package.json' || json.version !== undefined, published: json.private !== true };
  }
  if (base === 'Cargo.toml') return { name: tomlValue(text, 'package', 'name'), version: tomlValue(text, 'package', 'version'), versioned: true, published: tomlValue(text, 'package', 'publish') !== 'false' };
  if (base === 'pyproject.toml') return { name: tomlValue(text, 'project', 'name'), version: tomlValue(text, 'project', 'version'), versioned: true, published: true };
  return { name: path.posix.dirname(file), version: text.trim(), versioned: true, published: false };
}

/** The package files of the tracked files that a tag covers. */
export function coveredFiles(directory, files) {
  return files.filter((file) => PACKAGE_FILES.includes(path.posix.basename(file)) && (directory === '' || file.startsWith(`${directory}/`)));
}

/** The section `## <version>` of a change log without its heading, or null when it has none. */
export function changelogSection(text, version) {
  const lines = text.split('\n');
  const start = lines.indexOf(`## ${version}`);
  if (start === -1) return null;
  const end = lines.findIndex((line, index) => index > start && /^## /.test(line));
  return lines.slice(start + 1, end === -1 ? undefined : end).join('\n').trim();
}

/** The problems of the commit of a tag: not on main, or a required check run that is missing or did not succeed. */
export async function commitProblems({ sha, repository, run }) {
  const problems = [];
  const ancestor = await run('git', ['merge-base', '--is-ancestor', sha, 'origin/main']);
  if (ancestor.status === 1) problems.push(`the commit ${sha} is not on origin/main`);
  else if (ancestor.status !== 0) problems.push(`git merge-base --is-ancestor ${sha} origin/main exited ${ancestor.status}: ${ancestor.stderr.trim()}`);
  const api = await run('gh', ['api', '--paginate', `repos/${repository}/commits/${sha}/check-runs?per_page=100`,
    '--jq', '.check_runs[] | {name, status, conclusion}']);
  if (api.status !== 0) {
    problems.push(`gh api repos/${repository}/commits/${sha}/check-runs exited ${api.status}: ${api.stderr.trim()}`);
    return problems;
  }
  const runs = api.stdout.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  for (const name of REQUIRED_CHECKS) {
    const found = runs.filter((check) => check.name === name);
    if (found.length === 0) problems.push(`the check ${name} has no run on ${sha}; expected conclusion success`);
    for (const check of found.filter((entry) => entry.status !== 'completed' || entry.conclusion !== 'success')) {
      problems.push(`the check ${name} on ${sha} is ${check.status} with conclusion ${check.conclusion}; expected completed with conclusion success`);
    }
  }
  return problems;
}

/** The problems of the versions and the change log of a tag. */
export function versionProblems({ tag, files, read }) {
  const { directory, version } = parseTag(tag);
  const problems = [];
  if (directory !== '' && !files.includes(`${directory}/go.mod`)) problems.push(`${directory}/go.mod: the tag ${tag} names no Go module`);
  for (const file of coveredFiles(directory, files)) {
    const manifest = packageManifest(file, read(file));
    if (!manifest.versioned) continue;
    if (manifest.version !== version) problems.push(`${file}: version ${manifest.version ?? '(none)'}, tag ${tag} has ${version}`);
  }
  if (changelogSection(read('CHANGELOG.md'), version) === null) problems.push(`CHANGELOG.md: no section ## ${version}, tag ${tag} has ${version}`);
  return problems;
}

/** The archives of a tag: every package of `packages/` that is not private, none for a Go module tag. */
export function releaseAssets({ tag, files, read }) {
  const { directory, version } = parseTag(tag);
  if (directory !== '') return [];
  const kinds = { 'package.json': ['npm', 'tgz'], 'composer.json': ['composer', 'zip'], 'Cargo.toml': ['cargo', 'crate'] };
  return coveredFiles('', files)
    .filter((file) => /^packages\/[^/]+\/[^/]+$/.test(file) && kinds[path.posix.basename(file)])
    .map((file) => ({ file, manifest: packageManifest(file, read(file)) }))
    .filter(({ manifest }) => manifest.published)
    .map(({ file, manifest }) => {
      const [kind, extension] = kinds[path.posix.basename(file)];
      return { kind, directory: path.posix.dirname(file), name: manifest.name, file: assetName(manifest.name, version, extension) };
    });
}

/** Write the archive of every asset into `output`. */
export async function buildAssets({ root, sha, assets, output, run, log }) {
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  const cargoTarget = path.join(path.dirname(output), 'cargo');
  for (const asset of assets) {
    const target = path.join(output, asset.file);
    log(`release: ${asset.kind} ${asset.name} -> ${path.relative(root, target)}`);
    let result;
    let source;
    if (asset.kind === 'npm') {
      result = await run(process.execPath, [path.join(root, 'scripts/package-dist.mjs'), 'pack', path.join(root, asset.directory), output]);
      if (result.status === 0) source = path.join(output, packReport(result.stdout, asset.name).filename);
    } else if (asset.kind === 'composer') {
      result = await run('git', ['archive', '--format=zip', `--output=${target}`, `${sha}:${asset.directory}`]);
      source = target;
    } else {
      // --exclude-lockfile: a crate that depends on another crate of this repository by path and version packs before
      // that crate is published, and no registry is read.
      result = await run('cargo', ['package', '--no-verify', '--exclude-lockfile', '--manifest-path', path.join(root, asset.directory, 'Cargo.toml'), '--target-dir', cargoTarget]);
      source = path.join(cargoTarget, 'package', asset.file);
    }
    if (result.status !== 0) throw new Error(`the archive of ${asset.name} (${asset.directory}) failed: exit ${result.status}: ${result.stderr.trim()}`);
    if (!fs.existsSync(source)) throw new Error(`the archive of ${asset.name} is missing: expected ${source}`);
    if (source !== target) fs.renameSync(source, target);
  }
  return assets.map((asset) => path.join(output, asset.file));
}

/** Create the GitHub Release of the tag with the change log section as its notes and the archives of `output`. */
export async function publish({ root, tag, output, run, read }) {
  const { version } = parseTag(tag);
  const notes = changelogSection(read('CHANGELOG.md'), version);
  if (notes === null) throw new Error(`CHANGELOG.md: no section ## ${version}, tag ${tag} has ${version}`);
  const notesFile = path.join(path.dirname(output), 'notes.md');
  fs.mkdirSync(path.dirname(notesFile), { recursive: true });
  fs.writeFileSync(notesFile, `${notes}\n`);
  const assets = fs.existsSync(output) ? fs.readdirSync(output).sort().map((file) => path.join(output, file)) : [];
  if (parseTag(tag).directory === '' && assets.length === 0) throw new Error(`${path.relative(root, output)} holds no archive for ${tag}; run make release-assets first`);
  const result = await run('gh', ['release', 'create', tag, '--verify-tag', '--title', tag, '--notes-file', notesFile, ...assets]);
  if (result.status !== 0) throw new Error(`gh release create ${tag} exited ${result.status}: ${result.stderr.trim()}`);
  return assets;
}

function spawn(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.error) return { status: 127, stdout: '', stderr: `${command}: ${result.error.message}` };
  return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

async function main([operation, ...rest]) {
  const environment = Object.fromEntries(['GITHUB_REF_NAME', 'GITHUB_SHA', 'GITHUB_REPOSITORY'].map((name) => [name, process.env[name]]));
  const missing = Object.entries(environment).filter(([, value]) => !value).map(([name]) => name);
  if (!['check', 'assets', 'publish'].includes(operation) || rest.length > 0 || missing.length > 0) {
    throw new Error(missing.length > 0 ? `${missing.join(', ')} not set. ${USAGE}` : USAGE);
  }
  const { GITHUB_REF_NAME: tag, GITHUB_SHA: sha, GITHUB_REPOSITORY: repository } = environment;
  const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
  const listed = spawn('git', ['ls-files', '-z']);
  if (listed.status !== 0) throw new Error(`git ls-files exited ${listed.status}: ${listed.stderr.trim()}`);
  const files = listed.stdout.split('\0').filter(Boolean);
  const output = path.join(ROOT, OUTPUT, 'assets');
  const log = (line) => process.stderr.write(`${line}\n`);
  if (operation === 'check') {
    log(`release: checking ${tag} at ${sha} of ${repository}`);
    const problems = [...await commitProblems({ sha, repository, run: spawn }), ...versionProblems({ tag, files, read })];
    for (const problem of problems) log(`::error::release ${tag}: ${problem}`);
    log(problems.length === 0 ? `release: ${tag} is on main, its checks ${REQUIRED_CHECKS.join(' and ')} succeeded and every version is ${parseTag(tag).version}` : `release: ${problems.length} problems`);
    return problems.length === 0 ? 0 : 1;
  }
  if (operation === 'assets') {
    const written = await buildAssets({ root: ROOT, sha, assets: releaseAssets({ tag, files, read }), output, run: spawn, log });
    log(`release: ${written.length} archives in ${path.relative(ROOT, output)}`);
    return 0;
  }
  const published = await publish({ root: ROOT, tag, output, run: spawn, read });
  log(`release: created the GitHub Release ${tag} with ${published.length} archives`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((status) => { process.exitCode = status; }, (error) => {
    process.stderr.write(`::error::release: ${error.message}\n`);
    process.exitCode = 1;
  });
}
