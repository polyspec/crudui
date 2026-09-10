#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  buildPhpExtension,
  declaredValue,
  resolveHomebrewPhpConfig,
} from './php-extension-builder.mjs';

const generatedPaths = [
  '.build',
  '.libs',
  'autom4te.cache',
  'build',
  'include',
  'modules',
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
  'ordered_json.dep',
  'ordered_json.la',
  'ordered_json.lo',
  'run-tests.php',
];

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
  return buildPhpExtension({
    sourceRoot,
    moduleName: 'ordered_json',
    minimumPhpVersion: 80200,
    require64Bit: false,
    needsCargo: false,
    sources: ['ordered_json.c'],
    compilerArguments: ['-Wno-unused-parameter'],
    definitions: ['COMPILE_DL_ORDERED_JSON=1', 'ZEND_COMPILE_DL_EXT=1'],
    generatedPaths,
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
