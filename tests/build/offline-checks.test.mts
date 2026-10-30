// The checks run offline, and only the install targets download (docs/operations/package-build.md, "Offline checks"): the
// Makefile exports the offline settings of cargo, go, npm and Composer, and `$(ONLINE)` lifts them for the recipe lines
// of the install targets, dependency-review and the consumer installs of the release archives alone. cargo answers a missing crate offline with "retry
// without --offline"; the crates of every Cargo.lock are fetched by install-kit (K864, fetch-cargo-downloads of @polyspec/kit),
// so no target depends on a check of them.
// A target runs cargo when a recipe line runs `run-tests.mts cargo` or `run-suite.mts cargo` or `run-rust-command.mts` with a command other than
// fmt, or starts a file, an npm script or a package test that does, directly or through the files that it imports or
// names.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { makeTargets } from '../../scripts/test-commands.mts';
import { parseJson, manifestSchema } from '../json.mts';
import { checkedFiles } from '@polyspec/kit/tracked-files';
import { makeDryRun } from './make-dry-run.mts';

/** The prerequisites and recipe lines of a Makefile target. */
interface MakeRule {
  prerequisites: string[];
  commands: string[];
}

/** The part of a package.json that runsCargo reads. */
interface Manifest {
  name?: string;
  scripts?: Record<string, string>;
}

const ROOT = path.resolve(import.meta.dirname, '../..');

const SELF = 'tests/build/offline-checks.test.mts';
// The targets of the kit.mk and bootstrap of @polyspec/kit that download: the tools, the packages, the
// crates, the dependency review, the Python locks, the release tools and backend, the locks of the consumer projects and
// the proof of a release, and the release archives of other repositories (kit K140, K865). The tool lifts the
// offline settings itself.
const KIT_DOWNLOADS = ['install-tools', 'install-packages', 'cargo-downloads-fetch', 'toolchain-lock'];
const read = (file: string): string => readFileSync(path.join(ROOT, file), 'utf8');
const makefile = read('Makefile');
// The evaluated database contains the commands and prerequisites of the checkout and its installed kit. KIT_WORKTREE is empty,
// so the recipes of the checkout that downloads are the ones checked, in a worktree as on main (a worktree's install-tools refuses).
const database = makeDryRun(ROOT, 'help', { database: true, variables: ['KIT_WORKTREE='] });
assert.equal(database.status, 0, database.stderr);
const makefiles = database.stdout;
const rules: Record<string, MakeRule> = makeTargets(makefiles);
const INSTALLS = Object.entries(rules)
  .filter(([name, rule]) => (name.startsWith('install-') || name.startsWith('crudui-install-')) && rule.commands.some(command => command.includes('$(ONLINE)')))
  .map(([name]) => name);
const KIT_ONLINE = Object.entries(rules)
  .filter(([, rule]) => rule.commands.some(command => command.includes('$(ONLINE)')))
  .map(([name]) => name);
const DOWNLOADS = [...new Set([...KIT_DOWNLOADS, ...KIT_ONLINE, ...INSTALLS])];

/** The value of a Makefile variable defined with `=` or `:=` over continued lines. */
function variable(name: string): string {
  const match = new RegExp(`^${name}\\s*:?=((?:.*\\\\\\n)*.*)$`, 'm').exec(makefile);
  return match?.[1] !== undefined ? match[1].replace(/\\\n/g, ' ') : '';
}

/** The files that run cargo: those that start scripts/run-rust-command.mts, and those that import such a file. */
function cargoFiles(): Set<string> {
  const sources = checkedFiles(ROOT).filter(file => /\.(?:mts|mjs|js)$/.test(file) && file !== SELF);
  const texts = new Map(sources.map(file => [file, read(file)]));
  const ENTRY = 'scripts/run-rust-command.mts';
  // The test runner starts cargo only for `run-tests.mts cargo`, which a command names, and scripts/test-commands.mts
  // reads commands without running them.
  const readers = new Set(['tests/conformance/run-suite.mts', 'scripts/test-commands.mts']);
  const found = new Set([ENTRY]);
  for (let added = true; added;) {
    added = false;
    for (const [file, text] of texts) {
      if (found.has(file) || readers.has(file)) continue;
      const test = /\.test\.m[jt]s$/.test(file);
      // The tests of the entry point import it and run it with stub toolchains.
      const imports = [...text.matchAll(/(?:from|import\()\s*'(\.[^']+)'/g)].some(([, specifier]) => {
        assert.ok(specifier !== undefined);
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
        return found.has(target) && !(test && target === ENTRY);
      });
      // A program starts cargo by the path of the entry point; a test that names it copies it into a fixture.
      const names = !test && text.includes('run-rust-command.mts');
      if (imports || names) {
        found.add(file);
        added = true;
      }
    }
  }
  return found;
}

const CARGO_FILES = cargoFiles();

/** Whether a shell command, run in `directory`, starts cargo. */
function runsCargo(command: string, directory = '.', seen = new Set<string>()): boolean {
  if (/(?:run-tests\.(?:mts|\$\(KIT_EXT\))|run-suite\.mts) cargo\b/.test(command) || /run-rust-command\.mts (?!fmt\b)/.test(command)) return true;
  const manifestOf = (dir: string): Manifest => parseJson(read(path.posix.join(dir, 'package.json')), manifestSchema, path.posix.join(dir, 'package.json'));
  const script = (dir: string, name: string): boolean => {
    const key = `${dir}:${name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    const text = manifestOf(dir).scripts?.[name];
    return text ? runsCargo(text, dir, seen) : false;
  };
  for (const [, name] of command.matchAll(/(?:\$\(NPM\)|\bnpm) run ([\w:.-]+)/g)) if (name !== undefined && script(directory, name)) return true;
  for (const [, prefix] of command.matchAll(/(?:\$\(NPM\)|\bnpm) test --prefix (\S+)/g)) if (prefix !== undefined && script(prefix, 'test')) return true;
  for (const [, workspace] of command.matchAll(/(?:\$\(NPM\)|\bnpm) test -w (\S+)/g)) {
    const directories = checkedFiles(ROOT).filter(file => /^packages\/[^/]+\/package\.json$/.test(file)).map(path.posix.dirname);
    const found = directories.find(dir => manifestOf(dir).name === workspace);
    if (found && script(found, 'test')) return true;
  }
  // tests/native-generators/run.mts builds the Rust program only for its target rust, which runs when --target names it
  // or when no --target selects the targets.
  const nativeTargets = /\btests\/native-generators\/run\.mts\b[^;|&]*?--target (\S+)/.exec(command);
  if (nativeTargets?.[1] !== undefined && !nativeTargets[1].replace(/["']/g, '').split(',').includes('rust')) command = command.replace(/\S*tests\/native-generators\/run\.mts\b/, '');
  // `run-rust-command.mts fmt` formats sources and reads no crate.
  return command.replace(/\S*run-rust-command\.mts fmt\b/g, '').split(/[\s'"]+/).some(token => {
    const file = path.posix.normalize(path.posix.join(directory, token.replace(/^\$\(CURDIR\)\//, '')));
    if (!token || !/^[\w./-]+$/.test(token) || !existsSync(path.join(ROOT, file))) return false;
    return statSync(path.join(ROOT, file)).isDirectory() ? false : CARGO_FILES.has(file);
  });
}

test('the Makefile runs cargo, go, npm and Composer offline, and only the install targets lift it', () => {
  for (const setting of ['export CARGO_NET_OFFLINE := true', 'export GOPROXY := off', 'export npm_config_offline := true', 'export COMPOSER_DISABLE_NETWORK := 1']) {
    assert.ok(makefile.includes(`\n${setting}\n`), `the Makefile must ${setting}`);
  }
  assert.equal(variable('ONLINE').trim(), 'env -u CARGO_NET_OFFLINE -u GOPROXY -u npm_config_offline -u COMPOSER_DISABLE_NETWORK');
  const targets: Record<string, MakeRule> = makeTargets(makefiles);
  const online = Object.entries(targets).filter(([, rule]) => rule.commands.some(command => command.includes('$(ONLINE)'))).map(([name]) => name).sort();
  assert.deepEqual(online, [...DOWNLOADS].sort());
  // Every recipe line of an install target that downloads runs with $(ONLINE).
  const downloading = /\b(?:bootstrap-npm\.\$\(KIT_EXT\)|bootstrap-npm\.mts|install-tools\.\$\(KIT_EXT\)|npm ci\b|composer\b.*\binstall\b|fetch-cargo-downloads\.\$\(KIT_EXT\)|dependency-review\.\$\(KIT_EXT\)(?! --provider-entries\b)|release-tools\.\$\(KIT_EXT\)|release-backend\.\$\(KIT_EXT\))/;
  // The provider-entries mode rewrites local Composer metadata and returns before the registry review.
  assert.equal(downloading.test('$(NODE) $(KIT)/dependency-review.$(KIT_EXT) --record'), true);
  assert.equal(downloading.test('$(NODE) $(KIT)/dependency-review.$(KIT_EXT) --provider-entries'), false);
  const offline = Object.entries(targets).flatMap(([name, rule]) => rule.commands
    .filter(command => downloading.test(command) && !command.includes('$(ONLINE)'))
    .map(command => `${name}: ${command}`));
  assert.deepEqual(offline, []);
});


