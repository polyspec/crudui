#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  assertRegularPath,
  buildPhpExtension,
  declaredValue,
  resolveHomebrewPhpConfig,
} from './php-extension-builder.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');

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
  'crudui.la',
  'run-tests.php',
];

function arguments_(values) {
  const { values: options } = parseArgs({
    args: values,
    options: {
      'php-config': { type: 'string' },
      cc: { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });
  return options;
}

async function selectedPhpConfig(argument, environment) {
  const explicit = declaredValue('PHP_EXTENSION_PHP_CONFIG', argument, environment);
  if (explicit !== undefined) return explicit;
  if (process.platform === 'darwin') return resolveHomebrewPhpConfig({ environment });
  return undefined;
}

/** Build the CRUDUI PHP module from the repository source. */
export async function buildCRUDUIPhpExtension(options = {}) {
  const environment = options.environment ?? process.env;
  const phpConfig = options.phpConfig
    ?? await selectedPhpConfig(undefined, environment);
  return buildPhpExtension({
    sourceRoot: path.join(repositoryRoot, 'packages/php-ext'),
    moduleName: 'crudui',
    minimumPhpVersion: 80400,
    require64Bit: true,
    sources: [
      'src/crudui.c',
      'src/values.c',
      'src/errors.c',
      'src/value.c',
      'src/value_path.c',
      'src/engine_error.c',
      'src/compose.c',
      'src/template.c',
      'src/expression.c',
      'src/runtime.c',
      'src/date.c',
      'src/design.c',
      'src/widget.c',
      'src/messages.c',
      'src/binding.c',
      'src/html.c',
      'src/render.c',
      'src/list.c',
      'src/validation.c',
      'src/key.c',
      'src/form.c',
    ],
    includeDirectories: ['src'],
    definitions: ['COMPILE_DL_CRUDUI=1', 'ZEND_COMPILE_DL_EXT=1'],
    generatedPaths,
    buildDirectory: '.build',
    outputDirectory: 'modules',
    linuxLibraries: ['-lm', '-lpthread', '-ldl'],
    macosLibraries: ['-lm', '-lpthread', '-liconv', '-framework', 'CoreFoundation'],
    loadChecks: [/CRUDUI => enabled/, /Generation and validation => native/],
  }, { ...options, environment, phpConfig });
}

async function main() {
  const options = arguments_(process.argv.slice(2));
  const environment = process.env;
  await buildCRUDUIPhpExtension({
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
