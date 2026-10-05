// The package lock of the install project of `npm run test:packages` (scripts/check-packages.mjs), derived from the
// root package-lock.json, so the install project installs with `npm ci` offline from the npm cache that `make install` fills,
// and every run installs the same releases: the install project never resolves a range against a registry.
//
// The install project depends on the packed packages of this repository (`file:` tarballs) and on registry packages that the
// root lock records. Each registry package of the install project is the entry of the root lock that npm resolves from the
// place of its dependent: a direct dependency of the install project from the root, a dependency of a packed package from its
// workspace directory (`packages/<name>`), whose nested entries move under `node_modules/<package name>/`. The closure
// follows `dependencies`, `optionalDependencies` and `peerDependencies`.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** The sha512 integrity of a file, as npm records it. */
export const fileIntegrity = file => `sha512-${createHash('sha512').update(readFileSync(file)).digest('base64')}`;

const RELATIONS = ['dependencies', 'optionalDependencies', 'peerDependencies'];
const ROOT_FLAGS = new Set(['dev', 'devOptional', 'peer', 'optional']);

/** The lock path from which npm resolves `name` for a package at `from`: its own node_modules, then each parent's. */
export function resolveIn(packages, from, name) {
  let place = from;
  for (;;) {
    const candidate = place === '' ? `node_modules/${name}` : `${place}/node_modules/${name}`;
    if (packages[candidate] && !packages[candidate].link) return candidate;
    if (place === '') return null;
    const index = place.lastIndexOf('/node_modules/');
    place = index === -1 ? '' : place.slice(0, index);
  }
}

/**
 * The lock of an install project.
 * - `rootLock`: the parsed root package-lock.json.
 * - `manifest`: the install project package.json ({ name, version, dependencies }).
 * - `packed`: package name -> { directory, tarball, manifest }: the workspace directory in the root lock, the path of
 *   the packed tarball and its package.json.
 * Throws for a dependency that the root lock does not record.
 */
export function installLock({ rootLock, manifest, packed }) {
  const source = rootLock.packages ?? {};
  const packages = { '': { name: manifest.name, version: manifest.version, dependencies: { ...manifest.dependencies } } };
  const pending = [];
  const missing = [];
  // A dependency of the package at the root lock path `from`; an optional dependency or peer may be absent.
  const require = (from, name, dependent, optional) => {
    if (packed[name]) return;
    const found = resolveIn(source, from, name);
    if (!found) {
      if (!optional) missing.push(`${name} of ${dependent}`);
      return;
    }
    // A nested entry of a workspace moves under the packed package in the install project.
    const workspace = Object.values(packed).find(item => found.startsWith(`${item.directory}/node_modules/`));
    const installPath = workspace ? `node_modules/${workspace.manifest.name}/${found.slice(workspace.directory.length + 1)}` : found;
    if (packages[installPath]) return;
    // The flags of the root lock describe the root project; npm derives them for the install project.
    packages[installPath] = Object.fromEntries(Object.entries(source[found]).filter(([key]) => !ROOT_FLAGS.has(key)));
    pending.push(found);
  };
  const requireAll = (from, entry, dependent) => {
    for (const kind of RELATIONS) {
      for (const name of Object.keys(entry[kind] ?? {})) {
        require(from, name, dependent, kind === 'optionalDependencies' || (kind === 'peerDependencies' && entry.peerDependenciesMeta?.[name]?.optional === true));
      }
    }
  };

  for (const name of Object.keys(manifest.dependencies)) {
    const item = packed[name];
    if (!item) {
      require('', name, manifest.name, false);
      continue;
    }
    packages[`node_modules/${name}`] = {
      version: item.manifest.version, resolved: `file:${item.tarball}`, integrity: fileIntegrity(item.tarball),
      ...Object.fromEntries([...RELATIONS, 'peerDependenciesMeta'].filter(kind => item.manifest[kind]).map(kind => [kind, item.manifest[kind]])),
    };
    requireAll(item.directory, item.manifest, name);
  }
  while (pending.length) {
    const lockPath = pending.shift();
    requireAll(lockPath, source[lockPath], lockPath);
  }
  if (missing.length) throw new Error(`the root package-lock.json records no entry for ${missing.join(', ')}`);
  return { name: manifest.name, version: manifest.version, lockfileVersion: 3, requires: true, packages };
}
