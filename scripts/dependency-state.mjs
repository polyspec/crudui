// The dependency state of a checkout as its files record it, read without a network (docs/spec/package-build.md,
// "Dependency review"). The check scripts/check-dependencies.mjs compares it with the review record
// config/dependency-review.json; the developer command scripts/dependency-review.mjs compares it with the registries
// and writes that record.
//
// Scope: a registry dependency is an entry of `dependencies` or `devDependencies` of the root package.json or of a
// workspace package.json, or of `require` or `require-dev` of a Composer manifest that config/dependency-policy.json
// names, that a registry resolves. Peer dependencies are not read. A URL dependency names its source itself, a package
// of this repository (an npm workspace or a Composer path repository) is built from the checkout, and a Composer
// platform requirement (`php`, `ext-*`, ...) names the runtime: "latest stable release" has no meaning for them, so
// they are not registry dependencies. The check reads a package of this repository against its lock entry.
//
// The locks are package-lock.json, the composer.lock of each Composer manifest and every Cargo.lock of the checkout;
// the review records the sha256 and the advisories of each. A Cargo lock has no registry dependencies in the review:
// its advisories come from RustSec.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { trackedFiles } from './tracked-files.mjs';

export const POLICY = 'config/dependency-policy.json';
export const RECORD = 'config/dependency-review.json';
export const NPM_MANIFEST = 'package.json';
export const NPM_LOCK = 'package-lock.json';

const LOCAL_SPEC = /^(file|link|workspace):/;
const URL_SPEC = /^(?!npm:)[A-Za-z][A-Za-z0-9+.-]*:|^[^@/][^/]*\/[^/]/;
const PLATFORM_REQUIREMENT = /^(php(-64bit|-ipv6|-zts|-debug)?|hhvm|ext-.+|lib-.+|composer(-plugin-api|-runtime-api)?)$/;

export const readJson = (root, file) => JSON.parse(readFileSync(path.join(root, file), 'utf8'));

/** The sha256 of a file of the checkout, in hexadecimal. */
export function digest(root, file) {
  return createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex');
}

/** The numeric release of a version, without a leading `v`; null when the version is not `<major>.<minor>.<patch>`. */
export function versionParts(version) {
  const match = String(version).match(/^v?(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

/** Whether a version is a prerelease: a suffix after `-`, as in `10.0.0-rc.2` of npm and `2.0.0-beta1` of Composer. */
export function isPrerelease(version) {
  return /^v?\d+\.\d+\.\d+-/.test(String(version));
}

/** Whether `current` is an older release than `latest`; versions that are not numeric compare as strings. */
export function older(current, latest) {
  const left = versionParts(current);
  const right = versionParts(latest);
  if (!left || !right) return String(current).replace(/^v/, '') !== String(latest).replace(/^v/, '');
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index];
  }
  return false;
}

/** The stable releases of a list of versions, highest first. */
export function stableDescending(versions) {
  return versions.filter(version => !isPrerelease(version) && versionParts(version))
    .sort((left, right) => (older(left, right) ? 1 : older(right, left) ? -1 : 0));
}

/** The key of a dependency in the policy and the record. */
export const dependencyKey = ({ ecosystem, manifest, package: name }) => `${ecosystem}:${manifest}:${name}`;

/** The Cargo locks of the checkout: every Cargo.lock that is tracked or new and not ignored. */
export const cargoLocks = root => trackedFiles(root).filter(file => path.posix.basename(file) === 'Cargo.lock');

/** The ecosystem of a lock: npm, composer or cargo. */
export const lockEcosystem = lock => ({ 'package-lock.json': 'npm', 'composer.lock': 'composer', 'Cargo.lock': 'cargo' })[path.posix.basename(lock)];

/** The npm manifests of the checkout: the root package.json and the package.json of each workspace directory. */
export function npmManifests(root) {
  const manifest = readJson(root, NPM_MANIFEST);
  const workspaces = (manifest.workspaces ?? []).flatMap((pattern) => {
    if (!pattern.endsWith('/*')) throw new Error(`${NPM_MANIFEST}: unsupported workspace pattern ${pattern}`);
    const parent = pattern.slice(0, -2);
    return readdirSync(path.join(root, parent), { withFileTypes: true })
      .filter(entry => entry.isDirectory() && existsSync(path.join(root, parent, entry.name, NPM_MANIFEST)))
      .map(entry => `${parent}/${entry.name}`);
  }).sort();
  return ['.', ...workspaces].map(directory => ({
    directory, manifest: directory === '.' ? NPM_MANIFEST : `${directory}/${NPM_MANIFEST}`,
  }));
}

/** The lock entry of the package `name` that a manifest in `directory` resolves: its own node_modules first. */
export function npmLockEntry(lock, directory, name) {
  const nested = directory === '.' ? null : lock.packages?.[`${directory}/node_modules/${name}`];
  return nested ?? lock.packages?.[`node_modules/${name}`] ?? null;
}

/**
 * The dependency state of the checkout at `root` for the Composer manifests of `policy`: the registry dependencies
 * with their kind, range and locked version, the packages of this repository with their lock entries, and the locks.
 */
export function readState(root, policy) {
  const dependencies = [];
  const local = [];
  const locks = [NPM_LOCK];

  const lock = readJson(root, NPM_LOCK);
  const manifests = npmManifests(root);
  for (const { directory, manifest: manifestPath } of manifests) {
    const manifest = readJson(root, manifestPath);
    for (const kind of ['dependencies', 'devDependencies']) {
      for (const [name, spec] of Object.entries(manifest[kind] ?? {})) {
        const entry = npmLockEntry(lock, directory, name);
        if (LOCAL_SPEC.test(spec) || entry?.link) {
          const target = entry?.link ? entry.resolved : null;
          const targetManifest = target && existsSync(path.join(root, target, NPM_MANIFEST)) ? readJson(root, `${target}/${NPM_MANIFEST}`) : null;
          local.push({
            ecosystem: 'npm', manifest: manifestPath, package: name, spec, kind, directory: target,
            lockVersion: target ? lock.packages?.[target]?.version ?? null : null,
            version: targetManifest?.version ?? null, name: targetManifest?.name ?? null,
          });
          continue;
        }
        if (URL_SPEC.test(spec)) continue;
        dependencies.push({ ecosystem: 'npm', manifest: manifestPath, package: name, kind, spec, version: entry?.version ?? null, lock: NPM_LOCK });
      }
    }
  }

  for (const manifestPath of policy.composerManifests ?? []) {
    const lockPath = path.posix.join(path.posix.dirname(manifestPath), 'composer.lock');
    locks.push(lockPath);
    const composer = readJson(root, manifestPath);
    const composerLock = readJson(root, lockPath);
    const locked = new Map([...(composerLock.packages ?? []), ...(composerLock['packages-dev'] ?? [])].map(item => [item.name, item]));
    for (const kind of ['require', 'require-dev']) {
      for (const [name, spec] of Object.entries(composer[kind] ?? {})) {
        if (PLATFORM_REQUIREMENT.test(name)) continue;
        const entry = locked.get(name);
        if (entry?.dist?.type === 'path') {
          local.push({ ecosystem: 'composer', manifest: manifestPath, package: name, spec, kind, directory: entry.dist.url, lockVersion: entry.version, version: spec, name });
          continue;
        }
        dependencies.push({ ecosystem: 'composer', manifest: manifestPath, package: name, kind, spec, version: entry?.version ?? null, lock: lockPath });
      }
    }
  }
  locks.push(...cargoLocks(root));
  return { dependencies, local, locks, manifests, npmLock: lock };
}
