#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  buildPhpExtension,
  declaredValue,
  resolveHomebrewPhpConfig,
} from './php-extension-builder.mjs';

const generatedPaths = [
  '.libs',
  'autom4te.cache',
  'build',
  'include',
  'Makefile',
  'Makefile.fragments',
  'Makefile.objects',
  'config.cache',
  'config.h',
  'config.h.in',
  'config.h.in~',
  'config.log',
  'config.nice',
  'config.status',
  'configure',
  'configure.ac',
  'configure~',
  'confdefs.h',
  'libtool',
  'ordered_json.la',
  'run-tests.php',
];

const moduleName = 'ordered_json';

/**
 * Read the C sources of the module from the PHP_NEW_EXTENSION declaration of its config.m4. The
 * module must be declared once, under its name, with sources in the directory of config.m4.
 */
export function declaredExtensionSources(configText) {
  const declarations = [...configText.matchAll(/PHP_NEW_EXTENSION\(\s*\[?([A-Za-z0-9_]+)\]?\s*,\s*\[([^\]]*)\]/g)];
  assert.equal(declarations.length, 1, 'config.m4 must declare exactly one PHP_NEW_EXTENSION');
  const [, name, list] = declarations[0];
  assert.equal(name, moduleName, 'config.m4 must declare the module ' + moduleName);
  const sources = list.trim().split(/\s+/).filter(Boolean);
  assert.ok(sources.length > 0, 'config.m4 must declare the sources of ' + moduleName);
  for (const source of sources) {
    assert.match(source, /^[A-Za-z0-9_-]+\.c$/, 'config.m4 source must be a C file beside it: ' + source);
  }
  assert.equal(new Set(sources).size, sources.length, 'config.m4 must declare each source once');
  return sources;
}

function arguments_(values) {
  const { values: options } = parseArgs({
    args: values,
    options: {
      source: { type: 'string' },
      'php-config': { type: 'string' },
      cc: { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });
  if (!options.source) throw new Error('--source is required');
  if (!path.isAbsolute(options.source)) throw new Error('--source must be absolute');
  return options;
}

async function selectedPhpConfig(argument, environment) {
  const explicit = declaredValue('PHP_EXTENSION_PHP_CONFIG', argument, environment);
  if (explicit !== undefined) return explicit;
  if (process.platform === 'darwin') return resolveHomebrewPhpConfig({ environment });
  return undefined;
}

/** Build an OrderedJSON PHP module from one explicitly declared source directory. */
export async function buildOrderedJsonPhpExtension(sourceRoot, options = {}) {
  if (!path.isAbsolute(sourceRoot)) throw new Error('OrderedJSON source must be absolute');
  const environment = options.environment ?? process.env;
  const phpConfig = options.phpConfig
    ?? await selectedPhpConfig(undefined, environment);
  const sources = declaredExtensionSources(
    await readFile(path.join(sourceRoot, 'config.m4'), 'utf8'));
  const objectPaths = sources.flatMap(source => {
    const stem = path.basename(source, '.c');
    return [stem + '.dep', stem + '.lo'];
  });
  return buildPhpExtension({
    sourceRoot,
    moduleName,
    minimumPhpVersion: 80200,
    require64Bit: false,
    sources,
    compilerArguments: ['-Wno-unused-parameter'],
    definitions: ['COMPILE_DL_ORDERED_JSON=1', 'ZEND_COMPILE_DL_EXT=1'],
    generatedPaths: [...generatedPaths, ...objectPaths],
    buildDirectory: '.build',
    outputDirectory: 'modules',
    linuxLibraries: [],
    macosLibraries: [],
    loadChecks: [/ordered_json support => enabled/],
  }, { ...options, environment, phpConfig });
}

async function main() {
  const options = arguments_(process.argv.slice(2));
  const environment = process.env;
  await buildOrderedJsonPhpExtension(options.source, {
    environment,
    phpConfig: await selectedPhpConfig(options['php-config'], environment),
    compiler: declaredValue('PHP_EXTENSION_CC', options.cc, environment),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write((error.stack ?? error.message ?? String(error)) + '\n');
    process.exitCode = 1;
  });
}
