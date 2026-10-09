// A Python package of the repository installs another one from the tag of this repository: the requirement is a git pin
// `name @ git+https://github.com/polyspec/crudui@vX.Y.Z#subdirectory=...`. The pin names the version of the repository, so a
// version change that leaves a pin behind installs the earlier release; scripts/kit/release.mjs does not read it.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { ROOT } from '../../scripts/kit/paths.mjs';
import { ownedFiles } from '../../scripts/repository-files.mjs';

const PIN = /git\+https:\/\/github\.com\/polyspec\/crudui@(\S+?)#/g;

/** The git pins of a pyproject.toml that name another tag than `v<version>`, as `<tag> instead of v<version>`. */
export function stalePins(text, version) {
  return [...text.matchAll(PIN)].filter(match => match[1] !== `v${version}`).map(match => `${match[1]} instead of v${version}`);
}

test('a git pin of another tag than the version is stale', () => {
  const text = 'dependencies = [\n  "polyspec-crudui-validator @ git+https://github.com/polyspec/crudui@v0.0.3#subdirectory=packages/validator-python",\n]\n';
  assert.deepEqual(stalePins(text, '0.0.4'), ['v0.0.3 instead of v0.0.4']);
  assert.deepEqual(stalePins(text, '0.0.3'), []);
  assert.deepEqual(stalePins('dependencies = []\n', '0.0.4'), []);
});

test('every git pin of a pyproject.toml of the repository names the version of package.json', () => {
  const version = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  const violations = ownedFiles(ROOT).filter(file => path.posix.basename(file) === 'pyproject.toml')
    .flatMap(file => stalePins(readFileSync(path.join(ROOT, file), 'utf8'), version).map(problem => `${file}: ${problem}`));
  assert.deepEqual(violations, []);
});

// make release-versions TAG=... runs make release-pins first: a git pin of this repository that names another version than the
// tag fails the release check, before the release (C13.1-23).
test('make release-pins fails a pin of another version than the tag and passes the pins of the tag', () => {
  const pins = path.join(ROOT, 'scripts/release-pins.mjs');
  const stale = spawnSync(process.execPath, [pins, 'v0.0.4'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(stale.status, 1, stale.stderr);
  assert.match(stale.stderr, /packages\/generator-python\/pyproject\.toml: v0\.0\.5 instead of v0\.0\.4/);
  const current = spawnSync(process.execPath, [pins, 'v0.0.5'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(current.status, 0, current.stderr);
  const directory = spawnSync(process.execPath, [pins, 'packages/validator-go/v0.0.5'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(directory.status, 0, directory.stderr);
});
