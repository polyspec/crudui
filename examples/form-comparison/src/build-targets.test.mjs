import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildTargets, completeBuild, planBuild, supervisedProcesses, supervisorFiles,
} from './build-targets.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const example = 'examples/form-comparison';

function summary(paths) {
  const plan = planBuild(paths);
  return { targets: plan.targets.map(target => target.id), restarts: plan.restarts,
    supervisor: plan.supervisor };
}

test('rebuilds and restarts nothing for sources read per request', () => {
  for (const file of [`${example}/api.php`, 'packages/generator-php/src/Form.php',
    'docs/spec/form-comparison.md', `${example}/servers/rust/target/release/crudui`,
    'packages/generator-react/README.md', 'packages/php-ext/README.ko.md', `${example}/README.md`]) {
    assert.deepEqual(summary([file]), { targets: [], restarts: [], supervisor: false }, file);
  }
});

test('reinstalls the Composer copies when the PHP validator or manifests change', () => {
  for (const file of ['packages/validator-php/src/Public/Validator.php',
    'packages/generator-php/composer.json', 'packages/generator-php/composer.lock']) {
    assert.deepEqual(summary([file]), { targets: ['composer'], restarts: [], supervisor: false });
  }
  // `install` keeps a path repository's copy while the lock is unchanged, so the copy is reinstalled.
  const composer = buildTargets.find(target => target.id === 'composer');
  assert.deepEqual(composer.steps.at(-1).args,
    ['--working-dir=packages/generator-php', 'reinstall', 'crudui/validator', '--no-interaction']);
});

test('rebuilds and restarts only the affected native server', () => {
  assert.deepEqual(summary(['packages/php-ext/src/template.c']),
    { targets: ['crudui-php-extension'], restarts: ['php-ext'], supervisor: false });
  assert.deepEqual(summary(['scripts/build-ordered-json-php-extension.mjs']),
    { targets: ['ordered-json-php-extension'], restarts: ['php-ext'], supervisor: false });
  assert.deepEqual(summary(['scripts/php-extension-builder.mjs']), {
    targets: ['crudui-php-extension', 'ordered-json-php-extension'], restarts: ['php-ext'],
    supervisor: false,
  });
  for (const file of ['examples/cross-check-console/validators/go/main.go',
    'examples/cross-check-console/validators/go/go.mod']) {
    assert.deepEqual(summary([file]),
      { targets: ['cross-check-go-validator'], restarts: ['public'], supervisor: false });
  }
  for (const file of ['examples/cross-check-console/validators/rust/src/main.rs',
    'examples/cross-check-console/validators/rust/Cargo.lock']) {
    assert.deepEqual(summary([file]),
      { targets: ['cross-check-rust-validator'], restarts: ['public'], supervisor: false });
  }
  assert.deepEqual(summary(['examples/cross-check-console/validators/rust/target/release/x']),
    { targets: [], restarts: [], supervisor: false });
  for (const file of [`${example}/servers/go/main.go`, 'packages/generator-go/form.go',
    'packages/validator-go/go.mod']) {
    assert.deepEqual(summary([file]), {
      targets: file.startsWith('packages/validator-go/')
        ? ['go-server', 'cross-check-go-validator'] : ['go-server'],
      restarts: file.startsWith('packages/validator-go/') ? ['public', 'go'] : ['go'],
      supervisor: false,
    });
  }
  for (const file of [`${example}/servers/rust/src/main.rs`, `${example}/servers/rust/Cargo.lock`,
    'packages/generator-rust/src/lib.rs', 'packages/validator-rust/Cargo.toml']) {
    assert.deepEqual(summary([file]), {
      targets: file.startsWith('packages/validator-rust/')
        ? ['cross-check-rust-validator', 'rust-server'] : ['rust-server'],
      restarts: file.startsWith('packages/validator-rust/') ? ['public', 'rust'] : ['rust'],
      supervisor: false,
    });
  }
});

test('restarts the public server when the JavaScript record server or the record contract changes', () => {
  for (const file of [`${example}/servers/javascript/main.mjs`, `${example}/servers/javascript/records.mjs`]) {
    assert.deepEqual(summary([file]), { targets: ['public-server'], restarts: ['public'], supervisor: false }, file);
  }
  assert.deepEqual(summary([`${example}/src/record-contract.mjs`]),
    { targets: ['frames', 'public-server'], restarts: ['public'], supervisor: false });
  // The servers read the published fixture per request, so a fixture change only rebuilds the pages.
  assert.deepEqual(summary([`${example}/fixtures/customer-records.json`]),
    { targets: ['frames'], restarts: [], supervisor: false });
});

test('reinstalls JavaScript dependencies and rebuilds what depends on them', () => {
  assert.deepEqual(summary(['package-lock.json']), {
    targets: ['npm-dependencies', 'javascript-packages', 'ordered-json-javascript', 'frames'], restarts: ['public'],
    supervisor: false,
  });
  assert.deepEqual(summary(['packages/generator-vue/src/components/Form.vue']),
    { targets: ['javascript-packages', 'frames'], restarts: [], supervisor: false });
  assert.deepEqual(summary([`${example}/src/frame.mjs`, `${example}/public/main.mjs`]),
    { targets: ['frames'], restarts: [], supervisor: false });
});

test('installs the pinned monorepo JavaScript package before building frames', () => {
  assert.deepEqual(summary(['scripts/install-ordered-json-js.mjs']), {
    targets: ['ordered-json-javascript', 'frames'], restarts: [], supervisor: false,
  });
  assert.deepEqual(summary([`${example}/src/ordered-json-source.mjs`]), {
    targets: ['ordered-json-javascript', 'frames'], restarts: [], supervisor: true,
  });
});

test('restarts the public server for its own sources and matrix readers for the matrix', () => {
  assert.deepEqual(summary([`${example}/server.mjs`]),
    { targets: ['public-server'], restarts: ['public'], supervisor: false });
  assert.deepEqual(summary([`${example}/src/runtime-paths.json`]), {
    targets: ['frames', 'browser-matrix'], restarts: ['public', 'go', 'rust'], supervisor: true,
  });
  assert.equal(summary([`${example}/supervisor.mjs`]).supervisor, true);
});

test('restarts the canonical public entry when the display console changes', () => {
  assert.deepEqual(summary(['examples/cross-check-console/client/app.js']), {
    targets: ['cross-check-console'], restarts: ['public'], supervisor: false,
  });
  assert.deepEqual(summary(['examples/cross-check-console/server/server.mjs']), {
    targets: ['cross-check-console'], restarts: ['public'], supervisor: false,
  });
  assert.deepEqual(summary(['examples/cross-check-console/validators/js/validate.mjs']), {
    targets: ['cross-check-console'], restarts: ['public'], supervisor: false,
  });
  assert.deepEqual(summary(['examples/cross-check-console/validators/php/validate.php']), {
    targets: ['cross-check-console'], restarts: ['public'], supervisor: false,
  });
});

test('a first build runs every target once and starts every process', () => {
  const plan = completeBuild();
  assert.deepEqual(plan.targets.map(target => target.id), buildTargets.map(target => target.id));
  assert.deepEqual(plan.restarts, ['public', 'php', 'php-ext', 'go', 'rust']);
  assert.deepEqual(supervisedProcesses, plan.restarts);
  for (const target of buildTargets) {
    assert.ok(target.steps.length > 0 || target.restarts.length > 0, target.id);
    for (const step of target.steps) {
      assert.ok(step.cwd.startsWith('/workspace/build/'), `${target.id}: ${step.cwd}`);
      assert.doesNotMatch(JSON.stringify(step), /\/workspace\/source/, target.id);
    }
  }
});

test('declares every module the supervisor runs from the mounted repository', async () => {
  const visited = new Set();
  async function visit(file) {
    const relative = path.relative(repositoryRoot, file);
    if (visited.has(relative)) return;
    visited.add(relative);
    if (!file.endsWith('.mjs')) return;
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/from '(\.{1,2}\/[^']+)'/g)) {
      await visit(path.resolve(path.dirname(file), match[1]));
    }
  }
  await visit(path.join(repositoryRoot, example, 'supervisor.mjs'));
  assert.deepEqual([...visited].sort(), [...supervisorFiles].sort());
  for (const file of supervisorFiles) await access(path.join(repositoryRoot, file));
});

test('restarts both PHP servers when the PHP server program changes', () => {
  assert.deepEqual(summary([`${example}/servers/php/main.mjs`]),
    { targets: ['php-server'], restarts: ['php', 'php-ext'], supervisor: false });
});
