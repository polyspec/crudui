import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const containerfile = await readFile(new URL('./Containerfile', import.meta.url), 'utf8');
const instructions = containerfile.replace(/\\\n/g, ' ').split('\n')
  .map(line => line.trim().replace(/\s+/g, ' ')).filter(line => line && !line.startsWith('#'));

test('builds one toolchain image without repository source', () => {
  // The stages are the recorded releases, each image by its digest (tests/build/runtime-version-policy.test.mjs).
  const stages = instructions.filter(line => line.startsWith('FROM '));
  assert.equal(stages.length, 5, stages.join('\n'));
  assert.match(stages[0], /^FROM golang:\d+\.\d+\.\d+-trixie@sha256:[0-9a-f]{64} AS go$/);
  assert.match(stages[1], /^FROM rust:\d+\.\d+\.\d+-slim-trixie@sha256:[0-9a-f]{64} AS rust$/);
  assert.match(stages[2], /^FROM node:\d+\.\d+\.\d+-trixie-slim@sha256:[0-9a-f]{64} AS node$/);
  assert.match(stages[3], /^FROM composer:\d+\.\d+\.\d+@sha256:[0-9a-f]{64} AS composer$/);
  assert.match(stages[4], /^FROM php:\d+\.\d+\.\d+-fpm-trixie@sha256:[0-9a-f]{64}$/);
  assert.equal(instructions.some(line => line.startsWith('ADD ')), false);
  for (const line of instructions.filter(line => line.startsWith('COPY '))) {
    assert.match(line, /^COPY --from=(?:go|rust|node|composer) \/usr\/(?:local\/)?\S+ \/usr\/local\/\S+$/);
  }
  // The npm release that package.json records is part of the toolchain, not a build of the source.
  const runs = instructions.filter(line => line.startsWith('RUN ') && !/^RUN node \/usr\/local\/lib\/node_modules\/npm\/bin\/npm-cli\.js install -g npm@\d+\.\d+\.\d+$/.test(line)).join('\n');
  assert.doesNotMatch(runs,
    /npm (?:ci|install|run)|composer (?:install|--working-dir)|cargo |go (?:build|test)|scripts\/|examples\/|packages\//);
  assert.doesNotMatch(containerfile,
    /source\.tar|metadata\.json|\/archives|sourceCommit|FORM_SOURCE|\/opt\/|WORKDIR \/workspace\/source/);
});

test('installs the pinned PHP, Go, Rust, Node.js and Chromium toolchain', () => {
  const install = instructions.find(line => line.startsWith('RUN apt-get update'));
  for (const name of ['git', 'build-essential', 'tini', 'nginx', 'chromium=154.0.8037.92-1~deb13u1',
    'chromium-sandbox=154.0.8037.92-1~deb13u1']) {
    assert.ok(install.split(' ').includes(name), name);
  }
  // PHP, php-fpm and php-config come from the php stage, Composer from its image; the PHP server program starts
  // `php-fpm` and `nginx` by name (servers/php/main.mjs), and the php image has php-fpm in /usr/local/sbin.
  assert.doesNotMatch(install, /\bphp\d|\bcomposer\b/);
  assert.ok(instructions.includes('COPY --from=composer /usr/bin/composer /usr/local/bin/composer'));
  assert.doesNotMatch(containerfile, /ln -s/);
  const environment = instructions.find(line => line.startsWith('ENV '));
  for (const setting of ['RUSTUP_HOME=/usr/local/rustup', 'CARGO_HOME=/workspace/cache/cargo',
    'CARGO_TARGET_DIR=/workspace/build/cargo-target', 'GOPATH=/workspace/cache/go',
    'GOCACHE=/workspace/cache/go-build', 'npm_config_cache=/workspace/cache/npm',
    'COMPOSER_HOME=/workspace/cache/composer', 'PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium']) {
    assert.ok(environment.split(' ').includes(setting), setting);
  }
});

test('reaps orphans with an init process and runs the supervisor as the unprivileged user', () => {
  const commands = instructions.filter(line => line.startsWith('CMD '));
  assert.equal(commands.length, 1);
  const command = JSON.parse(commands[0].slice('CMD '.length));
  // tini is process 1: builds, Git comparisons and browser checks leave orphans the supervisor
  // never adopted, and an unreaped orphan stays a zombie for the life of the container.
  assert.deepEqual(command.slice(0, 4), ['/usr/bin/tini', '--', 'sh', '-c']);
  assert.equal(instructions.some(line => line.startsWith('ENTRYPOINT ')), false,
    'One command keeps tini as process 1 however the runtime combines entrypoint and command');
  assert.equal(command[4], 'chown node:node /workspace/build /workspace/cache && exec setpriv '
    + '--reuid=node --regid=node --init-groups env HOME=/home/node node '
    + '/workspace/source/examples/form-comparison/supervisor.mjs');
  assert.match(containerfile, /git config --system --add safe\.directory \/workspace\/source/);
  assert.doesNotMatch(containerfile, /--no-sandbox|--disable-setuid-sandbox/);
});

test('includes the browser process check only in the complete runtime suite', async () => {
  const packageJson = JSON.parse(await readFile(
    new URL('../../package.json', import.meta.url), 'utf8'));
  const scripts = packageJson.scripts;
  // Every suite of the complete runtime suite runs after an earlier one failed, and each builds the packages it reads.
  assert.equal(scripts['test:form-comparison'],
    'status=0; npm run test:form-comparison:source || status=1; npm run test:form-comparison:library || status=1; '
    + 'npm run test:form-comparison:browser || status=1; exit $status');
  for (const name of ['source', 'library', 'browser']) {
    assert.ok(scripts[`test:form-comparison:${name}`].startsWith('node scripts/require-current-build.mjs && '), name);
  }
  assert.ok(scripts['test:form-comparison:source'].includes('src/*.test.mjs'));
  assert.doesNotMatch(scripts['test:form-comparison:source'], /browser-job\.browser\.mjs|prepare\.test\.mjs/);
  assert.equal(scripts['test:form-comparison:browser'],
    'node scripts/require-current-build.mjs && node scripts/run-tests.mjs node -- examples/form-comparison/src/browser-job.browser.mjs');
});

test('generation fixtures use the canonical operating system temporary directory', async () => {
  const source = await readFile(
    new URL('./generation-performance.test.mjs', import.meta.url), 'utf8',
  );
  assert.match(source, /realpathSync\(tmpdir\(\)\)/);
  assert.match(source, /lstatSync\(current\)/);
  assert.match(source, /state\.isSymbolicLink\(\)/);
  assert.doesNotMatch(source, /path\.join\(library, ['"]\.git\//);
});
