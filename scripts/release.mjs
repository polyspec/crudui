#!/usr/bin/env node
// The release of a pushed tag, run by .github/workflows/release.yml through make in this order (AGENTS.md, "Releases"):
//
//   `node scripts/release.mjs verify TAG`     the tagged commit is on main and its check runs `push-gate` and
//                                             `ci-passed` concluded success
//   `node scripts/release.mjs versions TAG`   every package file that the tag covers has the version of the tag, and
//                                             CHANGELOG.md has the section `## X.Y.Z`
//   `node scripts/release.mjs assets TAG`     builds the JavaScript packages (`make build`) and writes the archive of
//                                             every package that the tag covers to var/release/assets
//   `node scripts/release.mjs publish TAG`    creates the GitHub Release of the tag with the section `## X.Y.Z` of
//                                             CHANGELOG.md as its notes and the archives of var/release/assets; a
//                                             section over 125000 characters, the limit of a release body, is
//                                             replaced by one line that links it
//
// The tag comes from the argument, which the make targets take from the environment variable TAG; the commit is the
// commit of the tag, and `verify` reads the repository from GITHUB_REPOSITORY. A tag `vX.Y.Z` covers every
// package.json, composer.json, Cargo.toml, VERSION and pyproject.toml of the repository; a tag `<directory>/vX.Y.Z`
// names the Go module of that directory, covers the package files inside it, and builds and attaches nothing. The
// release assets are npm tarballs and Composer zips only: `<package>-<version>.tgz` from `npm pack` and
// `<vendor>-<package>-<version>.zip` from `git archive` of a Composer package directory, for every package of
// `packages/` that is not private. A crate is not released as an archive; it is consumed by git tag, because
// `cargo package` rewrites git dependencies into crates.io requirements that do not resolve. The checks do not run the
// tests again: the check runs of the commit hold them.
//
// A release archive installs without the repository tree, beside the other archives that it depends on. The published
// manifests are the package manifests of `packages/`, packed unchanged: each names every dependency of the npm scope
// `@polyspec` and the Composer vendor `polyspec` by its exact released version, and a `composer.json` declares its
// `version` and no `repositories`; development resolution is in the root package.json (npm workspaces) and the root
// composer.json (path repositories), which are not published. `assets` fails when a packed manifest differs from its
// package manifest or has a problem of manifestProblems.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { packReport } from './package-install-pack.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
export const REQUIRED_CHECKS = ['push-gate', 'ci-passed'];
export const PACKAGE_FILES = ['package.json', 'composer.json', 'Cargo.toml', 'VERSION', 'pyproject.toml'];
const OUTPUT = 'var/release';
const OPERATIONS = ['verify', 'versions', 'assets', 'publish'];
const USAGE = 'Usage: node scripts/release.mjs verify | versions | assets | publish <tag> (verify with GITHUB_REPOSITORY)';
/** How a tag vX.Y.Z releases each kind of package file of `packages/`. */
export const RELEASES = {
  'package.json': 'npm tarball',
  'composer.json': 'Composer zip',
  'Cargo.toml': 'not released as an archive; consumed by git tag',
};
const ARCHIVES = { 'package.json': ['npm', 'tgz'], 'composer.json': ['composer', 'zip'] };
/** The longest body of a GitHub Release, in characters. */
export const NOTES_LIMIT = 125000;
const REPOSITORY_URL = 'https://github.com/polyspec/crudui';
const CHANGELOG = 'CHANGELOG.md';

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

/** The dependency fields of a packed `package.json` that a consumer installs. */
export const NPM_DEPENDENCY_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'];
const NPM_SCOPE = '@polyspec/';
const COMPOSER_VENDOR = 'polyspec/';
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

/** How a dependency on a polyspec package fails to install beside the release archives, or null for an exact version. */
function dependencyForm(constraint) {
  const text = String(constraint);
  if (EXACT_VERSION.test(text)) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return 'a URL';
  if (/^(file|link|workspace|portal):/.test(text)) return 'a path of the repository';
  if (/^(git(\+[a-z]+)?|github|gitlab|bitbucket|ssh):|^git@|^[\w.-]+\/[\w.-]+(#.*)?$/.test(text)) return 'a git source';
  if (/@dev\b|^dev-|-dev$/.test(text)) return 'a development version';
  return 'a range, not the exact released version';
}

/**
 * The problems of a packed manifest: a dependency of the scope `@polyspec` or the vendor `polyspec` that is not an exact
 * version (a URL, a path, a git source, a range or a development version), and in a `composer.json` a `repositories`
 * entry or a `version` that is not an exact version.
 */
export function manifestProblems(kind, manifest) {
  const problems = [];
  const fields = kind === 'npm' ? NPM_DEPENDENCY_FIELDS : ['require', 'require-dev'];
  const prefix = kind === 'npm' ? NPM_SCOPE : COMPOSER_VENDOR;
  for (const field of fields) {
    for (const [name, constraint] of Object.entries(manifest[field] ?? {})) {
      if (!name.startsWith(prefix)) continue;
      const form = dependencyForm(constraint);
      if (form) problems.push(`${manifest.name}: ${field} ${name} ${JSON.stringify(constraint)} is ${form}`);
    }
  }
  if (kind === 'composer') {
    if (manifest.repositories !== undefined) problems.push(`${manifest.name}: repositories ${JSON.stringify(manifest.repositories)} exist only in the repository`);
    if (!EXACT_VERSION.test(manifest.version ?? '')) problems.push(`${manifest.name}: version ${manifest.version ?? '(none)'} is no release version`);
  }
  return problems;
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

/**
 * The notes of the release of a tag: the change log section when it has at most NOTES_LIMIT characters, otherwise one
 * line that links the section `## X.Y.Z` of CHANGELOG.md at the tag, whose anchor is the version without its dots.
 */
export function releaseNotes({ section, tag }) {
  if ([...section].length <= NOTES_LIMIT) return section;
  const { version } = parseTag(tag);
  const ref = tag.split('/').map(encodeURIComponent).join('/');
  return `The changes of ${version} are listed in [${CHANGELOG}](${REPOSITORY_URL}/blob/${ref}/${CHANGELOG}#${version.replaceAll('.', '')}).`;
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

/** How a tag vX.Y.Z releases each package file of `packages/`: by RELEASES, or `private` for a package that is not published. */
export function releaseManifests({ files, read }) {
  return Object.fromEntries(coveredFiles('', files)
    .filter((file) => /^packages\/[^/]+\/[^/]+$/.test(file) && RELEASES[path.posix.basename(file)])
    .map((file) => [file, packageManifest(file, read(file)).published ? RELEASES[path.posix.basename(file)] : 'private']));
}

/** The archives of a tag: an npm tarball or a Composer zip of every package of `packages/` that is not private, none for a Go module tag. */
export function releaseAssets({ tag, files, read }) {
  const { directory, version } = parseTag(tag);
  if (directory !== '') return [];
  return Object.entries(releaseManifests({ files, read }))
    .filter(([file]) => ARCHIVES[path.posix.basename(file)])
    .filter(([, release]) => release !== 'private')
    .map(([file]) => {
      const [kind, extension] = ARCHIVES[path.posix.basename(file)];
      const { name } = packageManifest(file, read(file));
      return { kind, directory: path.posix.dirname(file), name, file: assetName(name, version, extension) };
    });
}

/** The output of a command, or an error naming the command, its exit status and its standard error. */
async function output(run, command, args, options) {
  const result = await run(command, args, options);
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}: ${result.stderr.trim()}`);
  return result.stdout;
}

/** The packed manifest text of a release archive: `package/package.json` of an npm tarball, `composer.json` of a Composer zip. */
export async function packedManifestText({ kind, file, run }) {
  return kind === 'npm'
    ? output(run, 'tar', ['-xzOf', file, 'package/package.json'])
    : output(run, 'unzip', ['-p', file, 'composer.json']);
}

/** The manifest file of an asset: `package.json` of an npm package, `composer.json` of a Composer package. */
const manifestFile = (kind) => (kind === 'npm' ? 'package.json' : 'composer.json');

/**
 * The problems of the packed manifests of the archives of `output`: a packed manifest that differs from the package
 * manifest of its directory under `root`, and the problems of manifestProblems.
 */
export async function assetProblems({ root, assets, output: directory, run }) {
  const problems = [];
  for (const asset of assets) {
    const file = manifestFile(asset.kind);
    const source = fs.readFileSync(path.join(root, asset.directory, file), 'utf8');
    const packed = await packedManifestText({ kind: asset.kind, file: path.join(directory, asset.file), run });
    if (packed !== source) problems.push(`${asset.file}: the packed ${file} differs from ${asset.directory}/${file}`);
    problems.push(...manifestProblems(asset.kind, JSON.parse(packed)));
  }
  return problems;
}

/** The problems of the published manifests of `packages/` that a tag releases (manifestProblems). */
export function publishedProblems({ files, read }) {
  return releaseAssets({ tag: 'v0.0.0', files, read })
    .flatMap(({ kind, directory }) => manifestProblems(kind, JSON.parse(read(`${directory}/${manifestFile(kind)}`)))
      .map((problem) => `${directory}/${manifestFile(kind)}: ${problem}`));
}

/**
 * Build the JavaScript packages (`make build`) and write the archive of every asset into `output`: `npm pack` of an npm
 * package and `git archive` of a Composer package directory; fail when a packed manifest has a problem of manifestProblems. A Go
 * module tag builds and attaches nothing: `output` stays empty and no command runs.
 */
export async function buildAssets({ root, tag, sha, assets, output: directory, run, log }) {
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });
  if (parseTag(tag).directory !== '') {
    log(`release: ${tag} is a Go module tag, which builds and attaches nothing`);
    return [];
  }
  const built = await run('make', ['build']);
  if (built.status !== 0) throw new Error(`make build exited ${built.status}: ${built.stderr.trim()}`);
  for (const asset of assets) {
    const target = path.join(directory, asset.file);
    log(`release: ${asset.kind} ${asset.name} -> ${path.relative(root, target)}`);
    try {
      if (asset.kind === 'npm') {
        const packed = await output(run, process.execPath, [path.join(root, 'scripts/package-dist.mjs'), 'pack', path.join(root, asset.directory), directory]);
        const source = path.join(directory, packReport(packed, asset.name).filename);
        if (!fs.existsSync(source)) throw new Error(`the archive is missing: expected ${source}`);
        if (source !== target) fs.renameSync(source, target);
      } else {
        await output(run, 'git', ['archive', '--format=zip', `--output=${target}`, `${sha}:${asset.directory}`]);
      }
    } catch (error) {
      throw new Error(`the archive of ${asset.name} (${asset.directory}) failed: ${error.message}`, { cause: error });
    }
    if (!fs.existsSync(target)) throw new Error(`the archive of ${asset.name} is missing: expected ${target}`);
  }
  const problems = await assetProblems({ root, assets, output: directory, run });
  if (problems.length > 0) throw new Error(`the packed manifests are not the published package manifests:\n${problems.join('\n')}`);
  return assets.map((asset) => path.join(directory, asset.file));
}

/**
 * Create the GitHub Release of the tag with the archives of `output` and the change log section as its notes, or the
 * line of releaseNotes that links the section when it is longer than NOTES_LIMIT.
 */
export async function publish({ root, tag, output, run, read }) {
  const { version } = parseTag(tag);
  const section = changelogSection(read(CHANGELOG), version);
  if (section === null) throw new Error(`CHANGELOG.md: no section ## ${version}, tag ${tag} has ${version}`);
  const notesFile = path.join(path.dirname(output), 'notes.md');
  fs.mkdirSync(path.dirname(notesFile), { recursive: true });
  fs.writeFileSync(notesFile, `${releaseNotes({ section, tag })}\n`);
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

async function main([operation, tag, ...rest]) {
  if (!OPERATIONS.includes(operation) || !tag || rest.length > 0) throw new Error(USAGE);
  parseTag(tag);
  const repository = process.env.GITHUB_REPOSITORY;
  if (operation === 'verify' && !repository) throw new Error(`GITHUB_REPOSITORY not set. ${USAGE}`);
  // RELEASE_COMMIT names the commit of `assets` before its tag exists, for the archives that the fixture locks of
  // `make release-install-lock` read; every other operation reads the commit of the tag.
  const ref = operation === 'assets' && process.env.RELEASE_COMMIT ? `${process.env.RELEASE_COMMIT}^{commit}` : `refs/tags/${tag}^{commit}`;
  const resolved = spawn('git', ['rev-parse', '--verify', ref]);
  if (resolved.status !== 0) throw new Error(`git rev-parse ${ref} exited ${resolved.status}: ${resolved.stderr.trim()}`);
  const sha = resolved.stdout.trim();
  const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
  const listed = spawn('git', ['ls-files', '-z']);
  if (listed.status !== 0) throw new Error(`git ls-files exited ${listed.status}: ${listed.stderr.trim()}`);
  const files = listed.stdout.split('\0').filter(Boolean);
  const output = path.join(ROOT, OUTPUT, 'assets');
  const log = (line) => process.stderr.write(`${line}\n`);
  if (operation === 'verify' || operation === 'versions') {
    log(`release: ${operation} ${tag} at ${sha}`);
    const problems = operation === 'verify' ? await commitProblems({ sha, repository, run: spawn }) : versionProblems({ tag, files, read });
    for (const problem of problems) log(`::error::release ${tag}: ${problem}`);
    const passed = operation === 'verify' ? `${tag} is on main and its checks ${REQUIRED_CHECKS.join(' and ')} succeeded` : `every version of ${tag} is ${parseTag(tag).version} and CHANGELOG.md has its section`;
    log(problems.length === 0 ? `release: ${passed}` : `release: ${problems.length} problems`);
    return problems.length === 0 ? 0 : 1;
  }
  if (operation === 'assets') {
    const written = await buildAssets({ root: ROOT, tag, sha, assets: releaseAssets({ tag, files, read }), output, run: spawn, log });
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
