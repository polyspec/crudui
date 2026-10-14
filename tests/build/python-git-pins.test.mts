// A Python package of the repository installs another one from the tag of this repository: the requirement is a git pin
// `name @ git+https://github.com/polyspec/crudui@vX.Y.Z#subdirectory=...`. The pin names the version of the repository, so a
// version change that leaves a pin behind installs the earlier release; the release tool of @polyspec/kit does not read it.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { missingSubdirectories } from '../../scripts/release-pins.mts';
import { ownedFiles } from '../../scripts/repository-files.mts';
import { readManifest } from '../json.mts';

const ROOT = path.resolve(import.meta.dirname, '../..');

const PIN = /git\+https:\/\/github\.com\/polyspec\/crudui@(\S+?)#/g;

/** The git pins of a pyproject.toml that name another tag than `v<version>`, as `<tag> instead of v<version>`. */
export function stalePins(text: string, version: string): string[] {
  return [...text.matchAll(PIN)].filter(match => match[1] !== `v${version}`).map(match => `${match[1]} instead of v${version}`);
}

test('a git pin of another tag than the version is stale', () => {
  const text = 'dependencies = [\n  "polyspec-crudui-validator @ git+https://github.com/polyspec/crudui@v0.0.3#subdirectory=packages/validator/python",\n]\n';
  assert.deepEqual(stalePins(text, '0.0.4'), ['v0.0.3 instead of v0.0.4']);
  assert.deepEqual(stalePins(text, '0.0.3'), []);
  assert.deepEqual(stalePins('dependencies = []\n', '0.0.4'), []);
});

test('every git pin of a pyproject.toml of the repository names the version of package.json', () => {
  const version = readManifest(path.join(ROOT, 'package.json')).version;
  assert.ok(version !== undefined, 'package.json declares its version');
  const violations = ownedFiles(ROOT).filter(file => path.posix.basename(file) === 'pyproject.toml')
    .flatMap(file => stalePins(readFileSync(path.join(ROOT, file), 'utf8'), version).map(problem => `${file}: ${problem}`));
  assert.deepEqual(violations, []);
});

// The subdirectory of a pin names the folder of the package in the tree of the tag; the release of a checkout whose
// package moved (C14.7) must name its new folder, so the check requires the folder in the checkout.
test('a git pin whose subdirectory is no package folder of the checkout is reported', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'crudui-pins-'));
  try {
    mkdirSync(path.join(root, 'packages/validator/python'), { recursive: true });
    writeFileSync(path.join(root, 'packages/validator/python/pyproject.toml'), '[project]\nname = "polyspec-crudui-validator"\n');
    const pin = (subdirectory: string) => `dependencies = ["polyspec-crudui-validator @ git+https://github.com/polyspec/crudui@v0.0.6#subdirectory=${subdirectory}"]\n`;
    assert.deepEqual(missingSubdirectories(pin('packages/validator/python'), root), []);
    assert.deepEqual(missingSubdirectories(pin('packages/validator-python'), root), ['subdirectory packages/validator-python is missing']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// make release-versions TAG=... runs make release-pins first: a git pin of this repository that names another version than the
// tag fails the release check, before the release (C13.1-23).
test('make release-pins fails a pin of another version than the tag and passes the pins of the tag', () => {
  const pins = path.join(ROOT, 'scripts/release-pins.mts');
  const stale = spawnSync(process.execPath, [pins, 'v0.0.4'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(stale.status, 1, stale.stderr);
  assert.match(stale.stderr, /packages\/generator\/python\/pyproject\.toml: v0\.0\.5 instead of v0\.0\.4/);
  // The pin of v0.0.5 names the folder packages/validator-python of that tag, which C14.7 moved: no release of this
  // checkout passes until the pin names the new folder with the new tag.
  const current = spawnSync(process.execPath, [pins, 'v0.0.5'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(current.status, 1, current.stderr);
  assert.match(current.stderr, /packages\/generator\/python\/pyproject\.toml: subdirectory packages\/validator-python is missing/);
  const directory = spawnSync(process.execPath, [pins, 'packages/validator/go/v0.0.5'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(directory.status, 1, directory.stderr);
});
