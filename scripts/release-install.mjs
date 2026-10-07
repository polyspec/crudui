#!/usr/bin/env node
// The install of the release archives as a consumer installs them (docs/operations/repository.md, "Installing the
// release archives"), in a temporary directory outside the repository, from the archives of `make release-assets` in
// var/release/assets and the consumer fixtures of tests/release-install:
//
//   node scripts/release-install.mjs check   copies the fixture and the archives, runs `npm ci` with an empty cache and
//                                            the scope @polyspec on an unreachable registry, and `composer install`
//                                            with an empty COMPOSER_HOME and COMPOSER_CACHE_DIR; the polyspec packages
//                                            come only from the archives, and a third-party package only as its lock
//                                            pins it
//   node scripts/release-install.mjs lock    writes the fixture manifests for the version of package.json and
//                                            regenerates their locks from the archives, with the polyspec archives
//                                            locked by name and version
//
// The fixtures name the archives of the version of package.json, so a release commit changes them with the version.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { useCheckoutNpm } from './checkout-npm.mjs';
import { assetName } from './release.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const FIXTURES = path.join(ROOT, 'tests/release-install');
const ASSETS = path.join(ROOT, 'var/release/assets');
/** The npm packages of the fixture: the root package and the packages that it requires. */
export const NPM_PACKAGES = ['@polyspec/crudui-generator-html', '@polyspec/crudui-generator-core', '@polyspec/crudui-validator'];
/** The Composer package of the fixture; the artifact repository resolves the validator that it requires. */
export const COMPOSER_PACKAGE = 'polyspec/crudui-generator';
const UNREACHABLE_REGISTRY = 'http://127.0.0.1:9/';

/** The fixture manifests of a version: package.json of the npm consumer and composer.json of the Composer consumer. */
export function fixtureManifests(version) {
  return {
    npm: {
      name: '@polyspec/crudui-release-install',
      version,
      private: true,
      dependencies: Object.fromEntries(NPM_PACKAGES.map((name) => [name, `file:${assetName(name, version, 'tgz')}`])),
    },
    composer: {
      name: 'polyspec/crudui-release-install',
      type: 'project',
      require: { php: '^8.4', [COMPOSER_PACKAGE]: version },
      repositories: [{ type: 'artifact', url: 'archives' }, { 'packagist.org': false }],
    },
  };
}

const json = (value, indent) => `${JSON.stringify(value, null, indent)}\n`;
const version = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

/** Run a command to its end; its output goes to standard error. */
function run(command, args, options) {
  execFileSync(command, args, { stdio: ['ignore', process.stderr, process.stderr], ...options });
}

/** The environments of npm and Composer without a cache of the machine and without the scope @polyspec on a registry. */
function environments(work) {
  const npm = { ...process.env, npm_config_cache: path.join(work, 'npm-cache'), 'npm_config_@polyspec:registry': UNREACHABLE_REGISTRY };
  delete npm.npm_config_offline;
  const composer = { ...process.env, COMPOSER_HOME: path.join(work, 'composer-home'), COMPOSER_CACHE_DIR: path.join(work, 'composer-cache') };
  for (const name of ['COMPOSER', 'COMPOSER_VENDOR_DIR', 'COMPOSER_DISABLE_NETWORK']) delete composer[name];
  return { npm, composer };
}

/** Copy the archives of the version into the npm project and the artifact directory of the Composer project. */
function projects(work, assets, release) {
  const npm = path.join(work, 'npm');
  const composer = path.join(work, 'composer');
  fs.mkdirSync(npm, { recursive: true });
  fs.mkdirSync(path.join(composer, 'archives'), { recursive: true });
  for (const name of NPM_PACKAGES) {
    const file = assetName(name, release, 'tgz');
    if (!fs.existsSync(path.join(assets, file))) throw new Error(`${path.relative(ROOT, assets)}/${file} is missing; run make release-assets`);
    fs.copyFileSync(path.join(assets, file), path.join(npm, file));
  }
  for (const file of fs.readdirSync(assets).filter((name) => name.endsWith('.zip'))) {
    fs.copyFileSync(path.join(assets, file), path.join(composer, 'archives', file));
  }
  return { npm, composer };
}

/** Install the fixtures from the archives and check the installed versions. */
export function check({ assets = ASSETS, fixtures = FIXTURES } = {}) {
  const release = version();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'crudui-release-install-'));
  try {
    const env = environments(work);
    const dir = projects(work, assets, release);
    for (const file of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(fixtures, 'npm', file), path.join(dir.npm, file));
    for (const file of ['composer.json', 'composer.lock']) fs.copyFileSync(path.join(fixtures, 'composer', file), path.join(dir.composer, file));
    run('npm', ['ci', '--no-audit', '--no-fund', '--ignore-scripts', '--workspaces=false', '--fetch-retries=0'], { cwd: dir.npm, env: env.npm });
    for (const name of NPM_PACKAGES) {
      const installed = JSON.parse(fs.readFileSync(path.join(dir.npm, 'node_modules', name, 'package.json'), 'utf8'));
      if (installed.version !== release) throw new Error(`npm installed ${name} ${installed.version}, the release is ${release}`);
    }
    run('composer', ['install', '--no-interaction', '--no-progress'], { cwd: dir.composer, env: env.composer });
    const installed = JSON.parse(fs.readFileSync(path.join(dir.composer, 'vendor/composer/installed.json'), 'utf8')).packages
      .filter(({ name }) => name.startsWith('polyspec/')).map(({ name, version: installedVersion }) => `${name} ${installedVersion}`).sort();
    const expected = [`polyspec/crudui-generator ${release}`, `polyspec/crudui-validator ${release}`];
    if (JSON.stringify(installed) !== JSON.stringify(expected)) throw new Error(`Composer installed ${installed.join(', ')}, expected ${expected.join(', ')}`);
    process.stderr.write(`release-install: npm ci and composer install of ${release} from the archives passed\n`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/** Write the fixture manifests of the version of package.json and regenerate their locks from the archives. */
export function lock({ assets = ASSETS, fixtures = FIXTURES } = {}) {
  const release = version();
  const manifests = fixtureManifests(release);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'crudui-release-install-'));
  try {
    const env = environments(work);
    const dir = projects(work, assets, release);
    fs.writeFileSync(path.join(dir.npm, 'package.json'), json(manifests.npm, 2));
    run('npm', ['install', '--package-lock-only', '--no-audit', '--no-fund', '--ignore-scripts', '--workspaces=false', '--fetch-retries=0'], { cwd: dir.npm, env: env.npm });
    fs.writeFileSync(path.join(dir.composer, 'composer.json'), json(manifests.composer, 4));
    run('composer', ['update', '--no-install', '--no-interaction', '--no-progress'], { cwd: dir.composer, env: env.composer });
    // The archives of a release are built from its tag, after the locks: a polyspec archive is locked by its name and
    // version, without integrity in npm and with an empty shasum in Composer; a third-party package keeps its integrity and shasum.
    const npmLock = JSON.parse(fs.readFileSync(path.join(dir.npm, 'package-lock.json'), 'utf8'));
    for (const [key, entry] of Object.entries(npmLock.packages)) if (key.startsWith('node_modules/@polyspec/')) delete entry.integrity;
    fs.writeFileSync(path.join(dir.npm, 'package-lock.json'), json(npmLock, 2));
    const composerLock = JSON.parse(fs.readFileSync(path.join(dir.composer, 'composer.lock'), 'utf8'));
    for (const entry of [...composerLock.packages, ...composerLock['packages-dev']]) if (entry.name.startsWith('polyspec/')) entry.dist.shasum = '';
    fs.writeFileSync(path.join(dir.composer, 'composer.lock'), json(composerLock, 4).replaceAll('\\/', '/'));
    fs.mkdirSync(path.join(fixtures, 'npm'), { recursive: true });
    fs.mkdirSync(path.join(fixtures, 'composer'), { recursive: true });
    for (const file of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(dir.npm, file), path.join(fixtures, 'npm', file));
    for (const file of ['composer.json', 'composer.lock']) fs.copyFileSync(path.join(dir.composer, file), path.join(fixtures, 'composer', file));
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const operation = process.argv[2];
  useCheckoutNpm();
  try {
    if (operation === 'check' && process.argv.length === 3) check();
    else if (operation === 'lock' && process.argv.length === 3) lock();
    else throw new Error('Usage: node scripts/release-install.mjs check | lock');
  } catch (error) {
    process.stderr.write(`::error::release-install: ${error.message}\n`);
    process.exitCode = 1;
  }
}
