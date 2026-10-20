// The package lock of the install project of `npm run test:packages` (scripts/check-packages.mts), derived from the
// root package-lock.json, so the install project installs with `npm ci` offline from the npm cache that `make install` fills,
// and every run installs the same releases: the install project never resolves a range against a registry.
//
// The install project depends on the packed packages of this repository (`file:` tarballs) and on registry packages that the
// root lock records. Each registry package of the install project is the entry of the root lock that npm resolves from the
// place of its dependent: a direct dependency of the install project from the root, a dependency of a packed package from its
// workspace directory (`packages/<name>`), whose nested entries move under `node_modules/<package name>/`. The closure
// follows `dependencies`, `optionalDependencies` and `peerDependencies`.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { SchemaObject } from 'ajv';
import { shapeOf } from './json-schema.mts';

/** The sha512 integrity of a file, as npm records it. */
export const fileIntegrity = (file: string): string => `sha512-${createHash('sha512').update(readFileSync(file)).digest('base64')}`;

const RELATIONS = ['dependencies', 'optionalDependencies', 'peerDependencies'] as const;

/** The dependency fields of a package.json or of an entry of a package lock. */
export interface DependencyFields {
  dependencies?: Record<string, string> | undefined;
  optionalDependencies?: Record<string, string> | undefined;
  peerDependencies?: Record<string, string> | undefined;
  peerDependenciesMeta?: Record<string, { optional?: boolean | undefined }> | undefined;
}

/** An entry of the `packages` of a package lock. */
export interface LockEntry extends DependencyFields {
  name?: string | undefined;
  version?: string | undefined;
  resolved?: string | undefined;
  integrity?: string | undefined;
  link?: boolean | undefined;
  dev?: boolean | undefined;
  devOptional?: boolean | undefined;
  peer?: boolean | undefined;
  optional?: boolean | undefined;
}

export type LockPackages = Record<string, LockEntry>;

/** A package.json of a packed package. */
export interface PackedManifest extends DependencyFields {
  name: string;
  version: string;
}

export interface PackedPackage {
  directory: string;
  tarball: string;
  manifest: PackedManifest;
}

export interface InstallManifest {
  name: string;
  version: string;
  dependencies: Record<string, string>;
}

export interface InstallLock {
  name: string;
  version: string;
  lockfileVersion: 3;
  requires: true;
  packages: LockPackages;
}
const ROOT_FLAGS = new Set(['dev', 'devOptional', 'peer', 'optional']);

/** The shapes of a dependency field: an object of strings, and peerDependenciesMeta objects with a boolean optional. */
const STRING_RECORD: SchemaObject = { type: 'object', additionalProperties: { type: 'string' } };
const PEER_META: SchemaObject = {
  type: 'object',
  additionalProperties: { type: 'object', properties: { optional: { type: 'boolean' } } },
};
const DEPENDENCY_FIELDS: Record<string, SchemaObject> = {
  dependencies: STRING_RECORD,
  optionalDependencies: STRING_RECORD,
  peerDependencies: STRING_RECORD,
  peerDependenciesMeta: PEER_META,
};
const LOCK_ENTRY: SchemaObject = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    version: { type: 'string' },
    resolved: { type: 'string' },
    integrity: { type: 'string' },
    link: { type: 'boolean' },
    dev: { type: 'boolean' },
    devOptional: { type: 'boolean' },
    peer: { type: 'boolean' },
    optional: { type: 'boolean' },
    ...DEPENDENCY_FIELDS,
  },
};

/** Whether `value` is an entry of the `packages` of a package lock, in the fields that the lock of the install project reads. */
export const isLockEntry = shapeOf<LockEntry>(LOCK_ENTRY);

/** Whether `value` is the `packages` of a package lock. */
export const isLockPackages = shapeOf<LockPackages>({ type: 'object', additionalProperties: LOCK_ENTRY });

/** Whether `value` is the package.json of a packed package: its name, version and dependency fields. */
export const isPackedManifest = shapeOf<PackedManifest>({
  type: 'object',
  required: ['name', 'version'],
  properties: { name: { type: 'string' }, version: { type: 'string' }, ...DEPENDENCY_FIELDS },
});

/** The lock path from which npm resolves `name` for a package at `from`: its own node_modules, then each parent's. */
export function resolveIn(packages: LockPackages, from: string, name: string): string | null {
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
export function installLock(
  { rootLock, manifest, packed }:
    { rootLock: { packages?: LockPackages | undefined }, manifest: InstallManifest, packed: Record<string, PackedPackage> },
): InstallLock {
  const source = rootLock.packages ?? {};
  const packages: LockPackages = { '': { name: manifest.name, version: manifest.version, dependencies: { ...manifest.dependencies } } };
  const pending: string[] = [];
  const missing: string[] = [];
  // A dependency of the package at the root lock path `from`; an optional dependency or peer may be absent.
  const require = (from: string, name: string, dependent: string, optional: boolean): void => {
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
    const entry = source[found];
    assert.ok(entry);
    // The entry of the root lock without its flags.
    packages[installPath] = Object.fromEntries(Object.entries(entry).filter(([key]) => !ROOT_FLAGS.has(key)));
    pending.push(found);
  };
  const requireAll = (from: string, entry: DependencyFields, dependent: string): void => {
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
      // The dependency fields that the packed package declares.
      ...Object.fromEntries(([...RELATIONS, 'peerDependenciesMeta'] as const)
        .filter(kind => item.manifest[kind]).map(kind => [kind, item.manifest[kind]])) as DependencyFields,
    };
    requireAll(item.directory, item.manifest, name);
  }
  while (pending.length) {
    const lockPath = pending.shift();
    assert.ok(lockPath !== undefined);
    const entry = source[lockPath];
    assert.ok(entry);
    requireAll(lockPath, entry, lockPath);
  }
  if (missing.length) throw new Error(`the root package-lock.json records no entry for ${missing.join(', ')}`);
  return { name: manifest.name, version: manifest.version, lockfileVersion: 3, requires: true, packages };
}
