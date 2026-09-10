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
  'native/.libs',
  'target',
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
  'native/errors.dep',
  'native/errors.lo',
  'native/crudui.dep',
  'native/crudui.lo',
  'native/values.dep',
  'native/values.lo',
];

async function prepareRust({ buildDirectory, commandEnvironment, jobs, run, sourceRoot, tools }) {
  const rustDirectory = path.join(buildDirectory, 'rust');
  const rustEnvironment = rustBuildEnvironment(commandEnvironment, tools);
  const arguments_ = [
    'build',
    '--release',
    '--locked',
    '--manifest-path', path.join(sourceRoot, 'Cargo.toml'),
    '--target-dir', rustDirectory,
  ];
  if (jobs) arguments_.push('--jobs', jobs);
  await run(tools.cargo, arguments_, { cwd: sourceRoot, environment: rustEnvironment });
  const staticLibrary = path.join(rustDirectory, 'release', 'libcrudui_engine.a');
  await assertRegularPath(staticLibrary, 'file');
  return { objects: [staticLibrary] };
}

/** Declare the regular Rust compiler and linker selected for the Cargo build. */
export function rustBuildEnvironment(environment, tools) {
  const linkerVariable = 'CARGO_TARGET_' + tools.rustHost.toUpperCase().replaceAll('-', '_')
    + '_LINKER';
  return {
    ...environment,
    RUSTC: tools.rustc,
    RUSTDOC: tools.rustdoc,
    CC: tools.compiler,
    [linkerVariable]: tools.compiler,
  };
}

function arguments_(values) {
  const { values: options } = parseArgs({
    args: values,
    options: {
      'php-config': { type: 'string' },
      cargo: { type: 'string' },
      rustc: { type: 'string' },
      rustdoc: { type: 'string' },
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
    needsCargo: true,
    sources: ['native/crudui.c', 'native/values.c', 'native/errors.c'],
    includeDirectories: ['native'],
    definitions: ['COMPILE_DL_CRUDUI=1', 'ZEND_COMPILE_DL_EXT=1'],
    generatedPaths,
    buildDirectory: '.build',
    outputDirectory: 'modules',
    prepare: prepareRust,
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
    cargo: declaredValue('PHP_EXTENSION_CARGO', options.cargo, environment),
    rustc: declaredValue('PHP_EXTENSION_RUSTC', options.rustc, environment),
    rustdoc: declaredValue('PHP_EXTENSION_RUSTDOC', options.rustdoc, environment),
    compiler: declaredValue('PHP_EXTENSION_CC', options.cc, environment),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write((error.stack ?? error.message ?? String(error)) + '\n');
    process.exitCode = 1;
  });
}
