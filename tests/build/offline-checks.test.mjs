// The checks run offline, and only the install targets download (docs/spec/package-build.md, "Offline checks"): the
// Makefile exports the offline settings of cargo, go, npm and Composer, and `$(ONLINE)` lifts them for the recipe lines
// of the install targets, dependency-review and the consumer installs of the release archives alone. cargo answers a missing crate offline with "retry
// without --offline"; every target that runs cargo depends on cargo-downloads-check (scripts/kit/check-cargo-downloads.mjs),
// which names the lock and `run make install` instead, so under make -k a target whose crates are missing does not run.
// A target runs cargo when a recipe line runs `run-tests.mjs cargo` or `run-suite.mjs cargo` or `run-rust-command.mjs` with a command other than
// fmt, or starts a file, an npm script or a package test that does, directly or through the files that it imports or
// names.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { makeTargets } from '../../scripts/test-commands.mjs';
import { ROOT } from '../../scripts/kit/paths.mjs';
import { checkedFiles } from '../../scripts/kit/tracked-files.mjs';

const SELF = 'tests/build/offline-checks.test.mjs';
const CHECK = 'cargo-downloads-check';
// The targets of scripts/kit/kit.mk that download: the vendored copy, the tools, the crates, the dependency review, the
// locks of the consumer projects and the proof of a release. release-consumer installs the archives of a release in clean
// projects: the script lifts the offline settings itself (scripts/kit/release-consumer.mjs).
const KIT_DOWNLOADS = ['kit-sync', 'install-tools', 'cargo-downloads-fetch', 'dependency-review', 'release-consumer-lock', 'release-proof'];
const DOWNLOADS = [...KIT_DOWNLOADS, 'install-node-modules', 'install-composer', 'install-phpdocumentor', 'install-browsers', 'install-ordered-json'];
const read = file => readFileSync(path.join(ROOT, file), 'utf8');
const makefile = read('Makefile');
// The targets of the Makefile and of the file that it includes.
const makefiles = `${makefile}\n${read('scripts/kit/kit.mk')}`;

/** The value of a Makefile variable defined with `=` or `:=` over continued lines. */
function variable(name) {
  const match = new RegExp(`^${name}\\s*:?=((?:.*\\\\\\n)*.*)$`, 'm').exec(makefile);
  return match ? match[1].replace(/\\\n/g, ' ') : '';
}

/** The files that run cargo: those that start scripts/run-rust-command.mjs, and those that import such a file. */
function cargoFiles() {
  const sources = checkedFiles(ROOT).filter(file => /\.(?:mjs|js)$/.test(file) && file !== SELF);
  const texts = new Map(sources.map(file => [file, read(file)]));
  const ENTRY = 'scripts/run-rust-command.mjs';
  // The test runner starts cargo only for `run-tests.mjs cargo`, which a command names, and scripts/test-commands.mjs
  // reads commands without running them.
  const readers = new Set(['scripts/kit/run-tests.mjs', 'tests/conformance/run-suite.mjs', 'scripts/test-commands.mjs']);
  const found = new Set([ENTRY]);
  for (let added = true; added;) {
    added = false;
    for (const [file, text] of texts) {
      if (found.has(file) || readers.has(file)) continue;
      const test = /\.test\.mjs$/.test(file);
      // The tests of the entry point import it and run it with stub toolchains.
      const imports = [...text.matchAll(/(?:from|import\()\s*'(\.[^']+)'/g)].some(([, specifier]) => {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
        return found.has(target) && !(test && target === ENTRY);
      });
      // A program starts cargo by the path of the entry point; a test that names it copies it into a fixture.
      const names = !test && text.includes('run-rust-command.mjs');
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
function runsCargo(command, directory = '.', seen = new Set()) {
  if (/(?:run-tests|run-suite)\.mjs cargo\b/.test(command) || /run-rust-command\.mjs (?!fmt\b)/.test(command)) return true;
  const manifestOf = dir => JSON.parse(read(path.posix.join(dir, 'package.json')));
  const script = (dir, name) => {
    const key = `${dir}:${name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    const text = manifestOf(dir).scripts?.[name];
    return text ? runsCargo(text, dir, seen) : false;
  };
  for (const [, name] of command.matchAll(/(?:\$\(NPM\)|\bnpm) run ([\w:.-]+)/g)) if (script(directory, name)) return true;
  for (const [, prefix] of command.matchAll(/(?:\$\(NPM\)|\bnpm) test --prefix (\S+)/g)) if (script(prefix, 'test')) return true;
  for (const [, workspace] of command.matchAll(/(?:\$\(NPM\)|\bnpm) test -w (\S+)/g)) {
    const directories = checkedFiles(ROOT).filter(file => /^packages\/[^/]+\/package\.json$/.test(file)).map(path.posix.dirname);
    const found = directories.find(dir => manifestOf(dir).name === workspace);
    if (found && script(found, 'test')) return true;
  }
  // tests/native-generators/run.mjs builds the Rust program only for its target rust, which runs when --target names it
  // or when no --target selects the targets.
  const nativeTargets = /\btests\/native-generators\/run\.mjs\b[^;|&]*?--target (\S+)/.exec(command);
  if (nativeTargets && !nativeTargets[1].replace(/["']/g, '').split(',').includes('rust')) command = command.replace(/\S*tests\/native-generators\/run\.mjs\b/, '');
  // `run-rust-command.mjs fmt` formats sources and reads no crate.
  return command.replace(/\S*run-rust-command\.mjs fmt\b/g, '').split(/[\s'"]+/).some(token => {
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
  const targets = makeTargets(makefiles);
  const online = Object.entries(targets).filter(([, rule]) => rule.commands.some(command => command.includes('$(ONLINE)'))).map(([name]) => name).sort();
  assert.deepEqual(online, [...DOWNLOADS].sort());
  // Every recipe line of an install target that downloads runs with $(ONLINE).
  const downloading = /\b(?:kit-sync\.mjs|install-tools\.mjs|ci --strict-allow-scripts|composer\b.*\binstall\b|check-cargo-downloads\.mjs --fetch|install-ordered-json\.mjs|dependency-review\.mjs|release-consumer\.mjs lock|release-proof\.mjs)/;
  const offline = Object.entries(targets).flatMap(([name, rule]) => rule.commands
    .filter(command => downloading.test(command) && !command.includes('$(ONLINE)'))
    .map(command => `${name}: ${command}`));
  assert.deepEqual(offline, []);
});

test('every target that runs cargo depends on cargo-downloads-check', () => {
  const targets = makeTargets(makefiles);
  assert.deepEqual(targets[CHECK]?.commands, ['node scripts/kit/check-cargo-downloads.mjs']);
  assert.ok(CARGO_FILES.has('scripts/gen-api-docs.mjs') && CARGO_FILES.has('tools/bench/run.js'), 'the cargo files must include the API documentation and the benchmark');
  assert.equal(runsCargo('node tests/native-generators/run.mjs --report r.json'), true);
  assert.equal(runsCargo('node tests/native-generators/run.mjs --target javascript,rust --report r.json'), true);
  assert.equal(runsCargo('node tests/native-generators/run.mjs --extension "$(PHP_EXTENSION)" --target php,php-native --report r.json'), false);
  const depends = (name, seen = new Set()) => {
    if (seen.has(name) || !targets[name]) return false;
    seen.add(name);
    return targets[name].prerequisites.some(prerequisite => prerequisite === CHECK || depends(prerequisite, seen));
  };
  // make ci and make rerun-failed start the guard scripts/kit/full-run.mjs before any step (tests/kit/full-run.test.mjs);
  // the targets of make that their commands run depend on the check.
  const missing = Object.entries(targets)
    .filter(([name]) => ![...DOWNLOADS, 'install', CHECK, 'ci', 'rerun-failed'].includes(name))
    .filter(([, rule]) => rule.commands.some(command => runsCargo(command)))
    .map(([name]) => name)
    .filter(name => !depends(name))
    .sort();
  assert.deepEqual(missing, [], `targets that run cargo without ${CHECK}; a missing crate fails them with "retry without --offline"`);
});
