import path from 'node:path';

import {
  binaryDirectory, cargoTargetDirectory, orderedJsonDirectory, publicDirectory, treeDirectory,
} from './server-layout.mjs';
import { formServers } from './runtime-paths.mjs';

const phpConfig = '/usr/bin/php-config8.4';
const example = 'examples/form-comparison';
const javascriptPackages =
  /^packages\/(?:validator-ts|generator-(?:core|html|react|vue|svelte))\//;
const phpExtensionBuilder = [
  'scripts/php-extension-builder.mjs', 'scripts/tool-resolution.mjs',
];

function step(command, args, cwd = treeDirectory, environment = {}) {
  return { command, args, cwd, environment };
}

/**
 * Files the supervisor itself runs from the mounted repository. A change to one of them causes
 * the supervisor process to reload from that mount while the container and its volumes remain.
 */
export const supervisorFiles = Object.freeze([
  `${example}/supervisor.mjs`,
  `${example}/src/build-targets.mjs`,
  `${example}/src/ordered-json-source.mjs`,
  `${example}/src/php-provenance.mjs`,
  `${example}/src/process-output.mjs`,
  `${example}/src/runtime-paths.json`,
  `${example}/src/runtime-paths.mjs`,
  `${example}/src/server-layout.mjs`,
  `${example}/src/server-startup.mjs`,
  `${example}/src/source-identity.mjs`,
  `${example}/src/source-tree.mjs`,
  `${example}/src/step-runner.mjs`,
]);

/** Processes in start order. */
export const supervisedProcesses = Object.freeze(['public', ...formServers]);

/**
 * Build targets in execution order. A target runs when a changed path matches one of its inputs
 * or when a target it depends on runs; afterwards its processes restart. Each target carries its
 * own timeout, sized from the measured duration of its first build with a whole-minute margin;
 * a target that reaches it fails the cycle instead of holding the build for an unbounded time.
 */
export const buildTargets = Object.freeze([
  {
    id: 'npm-dependencies',
    timeoutMs: 600_000,
    inputs: ['package.json', 'package-lock.json', /^packages\/[^/]+\/package\.json$/],
    dependsOn: [],
    steps: [step('npm', ['ci', '--strict-allow-scripts'])],
    restarts: ['public'],
  },
  {
    id: 'javascript-packages',
    timeoutMs: 600_000,
    inputs: [javascriptPackages, /^tsconfig[^/]*\.json$/],
    dependsOn: ['npm-dependencies'],
    steps: [step('npm', ['run', 'build'])],
    restarts: [],
  },
  {
    id: 'ordered-json-javascript',
    timeoutMs: 60_000,
    inputs: [`${example}/src/ordered-json-source.mjs`, 'scripts/install-ordered-json-js.mjs',
      'package.json', 'package-lock.json'],
    dependsOn: ['npm-dependencies'],
    steps: [step('node', ['scripts/install-ordered-json-js.mjs'])],
    restarts: [],
  },
  {
    id: 'frames',
    timeoutMs: 300_000,
    inputs: [
      new RegExp(`^${example}/(?:build\\.mjs|public/|benchmark/|benchmark-console/|src/|viewer/|fixtures/)`),
      javascriptPackages, 'tests/form-inspector/form-snapshot.mjs',
    ],
    dependsOn: ['npm-dependencies', 'ordered-json-javascript'],
    steps: [step('node', [`${example}/build.mjs`, publicDirectory])],
    restarts: [],
  },
  {
    // The public, Go and Rust servers read the browser matrix when they start.
    id: 'browser-matrix',
    timeoutMs: 60_000,
    inputs: [`${example}/src/runtime-paths.json`],
    dependsOn: [],
    steps: [],
    restarts: ['public', 'go', 'rust'],
  },
  {
    // PHP reads api.php per request; only the PHP server program needs its processes restarted.
    id: 'php-server',
    timeoutMs: 60_000,
    inputs: [new RegExp(`^${example}/servers/php/`)],
    dependsOn: [],
    steps: [],
    restarts: ['php', 'php-ext'],
  },
  {
    id: 'public-server',
    timeoutMs: 60_000,
    inputs: [`${example}/server.mjs`, new RegExp(`^${example}/servers/javascript/`),
      `${example}/src/json.mjs`, `${example}/src/record-contract.mjs`, `${example}/src/record-view.mjs`,
      `${example}/src/runtime-paths.mjs`,
      `${example}/check.mjs`],
    dependsOn: [],
    steps: [],
    restarts: ['public'],
  },
  {
    id: 'cross-check-console',
    timeoutMs: 60_000,
    inputs: [new RegExp('^examples/cross-check-console/(?:client/|server/|validators/(?:js|php)/)')],
    dependsOn: [],
    steps: [],
    restarts: ['public'],
  },
  {
    // PHP reads its sources per request; only the installed Composer copies need an update.
    // `install` keeps the validator's path-repository copy while the lock is unchanged, so the copy
    // is reinstalled from the tree.
    id: 'composer',
    timeoutMs: 300_000,
    inputs: [/^packages\/validator-php\//, /^packages\/generator-php\/composer\.(?:json|lock)$/],
    dependsOn: [],
    steps: [
      step('composer', ['--working-dir=packages/validator-php', 'install', '--no-interaction',
        '--prefer-dist']),
      step('composer', ['--working-dir=packages/generator-php', 'install', '--no-interaction',
        '--prefer-dist']),
      step('composer', ['--working-dir=packages/generator-php', 'reinstall', 'crudui/validator',
        '--no-interaction']),
    ],
    restarts: [],
  },
  {
    id: 'crudui-php-extension',
    timeoutMs: 180_000,
    inputs: [/^packages\/php-ext\//, 'scripts/build-crudui-php-extension.mjs',
      ...phpExtensionBuilder],
    dependsOn: [],
    steps: [step('node', ['scripts/build-crudui-php-extension.mjs', '--php-config', phpConfig])],
    restarts: ['php-ext'],
  },
  {
    id: 'ordered-json-php-extension',
    timeoutMs: 180_000,
    inputs: ['scripts/build-ordered-json-php-extension.mjs', ...phpExtensionBuilder],
    dependsOn: [],
    steps: [step('node', ['scripts/build-ordered-json-php-extension.mjs', '--php-config', phpConfig,
      '--source', path.join(orderedJsonDirectory, 'php-extension/src')])],
    restarts: ['php-ext'],
  },
  {
    id: 'go-server',
    timeoutMs: 300_000,
    inputs: [new RegExp(`^${example}/servers/go/`), /^packages\/(?:generator|validator)-go\//],
    dependsOn: [],
    steps: [step('go', ['build', '-trimpath', '-o', path.join(binaryDirectory, 'go'), '.'],
      path.join(treeDirectory, example, 'servers/go'), { CGO_ENABLED: '0' })],
    restarts: ['go'],
  },
  {
    id: 'cross-check-go-validator',
    timeoutMs: 300_000,
    inputs: [/^packages\/validator-go\//, new RegExp('^examples/cross-check-console/validators/go/')],
    dependsOn: [],
    steps: [step('go', ['build', '-trimpath', '-o', path.join(binaryDirectory, 'validator-go'), '.'],
      path.join(treeDirectory, 'examples/cross-check-console/validators/go'), { CGO_ENABLED: '0' })],
    restarts: ['public'],
  },
  {
    id: 'cross-check-rust-validator',
    timeoutMs: 900_000,
    inputs: [new RegExp('^packages/validator-rust/'),
      new RegExp('^examples/cross-check-console/validators/rust/(?!target/)')],
    dependsOn: [],
    steps: [
      step('cargo', ['build', '--locked', '--release', '--manifest-path',
        path.join(treeDirectory, 'examples/cross-check-console/validators/rust/Cargo.toml')]),
      step('install', ['-m', '0755', path.join(cargoTargetDirectory, 'release/crudui-cross-check-validator'),
        path.join(binaryDirectory, 'validator-rust')]),
    ],
    restarts: ['public'],
  },
  {
    id: 'rust-server',
    timeoutMs: 900_000,
    inputs: [new RegExp(`^${example}/servers/rust/(?!target/)`),
      /^packages\/(?:generator|validator)-rust\//],
    dependsOn: [],
    steps: [
      step('cargo', ['build', '--locked', '--release'],
        path.join(treeDirectory, example, 'servers/rust')),
      step('install', ['-m', '0755', path.join(cargoTargetDirectory, 'release/crudui-form-comparison'),
        path.join(binaryDirectory, 'rust')]),
    ],
    restarts: ['rust'],
  },
]);

const targetIndex = new Map(buildTargets.map((target, index) => [target.id, index]));
for (const [index, target] of buildTargets.entries()) {
  if (!(Number.isSafeInteger(target.timeoutMs) && target.timeoutMs > 0)) {
    throw new Error(`Build target ${target.id} must declare its own timeout`);
  }
  for (const dependency of target.dependsOn) {
    if (!(targetIndex.get(dependency) < index)) {
      throw new Error(`Build target ${target.id} must follow ${dependency}`);
    }
  }
  for (const name of target.restarts) {
    if (!supervisedProcesses.includes(name)) throw new Error('Unknown process: ' + name);
  }
}

// Markdown documents are read by people, never by a build or a server.
function matches(input, file) {
  if (file.endsWith('.md')) return false;
  return typeof input === 'string' ? input === file : input.test(file);
}

function restartsFor(targets) {
  const names = new Set(targets.flatMap(target => target.restarts));
  return supervisedProcesses.filter(name => names.has(name));
}

/** Return every target, and every process, for the first build of an empty build volume. */
export function completeBuild() {
  return { targets: [...buildTargets], restarts: [...supervisedProcesses], supervisor: false };
}

/** Select the targets, process restarts and supervisor restart that changed paths require. */
export function planBuild(paths) {
  const selected = new Set();
  for (const target of buildTargets) {
    if (paths.some(file => target.inputs.some(input => matches(input, file)))
        || target.dependsOn.some(dependency => selected.has(dependency))) {
      selected.add(target.id);
    }
  }
  const targets = buildTargets.filter(target => selected.has(target.id));
  return {
    targets,
    restarts: restartsFor(targets),
    supervisor: paths.some(file => supervisorFiles.includes(file)),
  };
}

/**
 * The processes one cycle starts: the ones its plan restarts and every supervised process that is
 * not running, such as one a failed cycle never started, in the supervised order.
 */
export function processesToStart(restarts, running) {
  return supervisedProcesses.filter(name => restarts.includes(name) || !running.includes(name));
}
