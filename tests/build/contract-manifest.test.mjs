// The contract manifest declares every JavaScript entry of every package with its exact value
// exports and visibility. Each failure the check reports is proven here on a synthetic
// repository, and the real repository must pass.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkContractManifest } from '../../scripts/check-contract-manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const realManifest = (await import('../../contracts/features.json', { with: { type: 'json' } })).default;

/** A feature record that satisfies the schema and its file links in the synthetic repository. */
function feature(id, owner, signature) {
  return {
    id, owner, signature, input: 'input', output: 'output', status: 'implemented', state: 'none',
    errors: ['TypeError'], fixtures: ['fixture.json'], tests: ['check.test.mjs'], docs: ['guide.md'],
    support: { javascript: 'pass' }, verification: [{ id: 'test-1', command: 'npm test' }],
  };
}

/** Two packages: `@crudui/core` with a public and an internal entry, and `@crudui/view` using both. */
function repository() {
  return {
    manifest: {
      format: 'crudui/features-manifest',
      version: '0.0.1',
      supportValues: ['pass', 'partial', 'unsupported'],
      packages: [
        {
          name: '@crudui/core', path: 'packages/core', layer: 'model',
          entries: {
            '.': { visibility: 'public', exports: ['Session', 'close', 'compile', 'open', 'renamed'] },
            './internal': { visibility: 'internal', exports: ['layout'] },
          },
        },
        {
          name: '@crudui/view', path: 'packages/view', layer: 'renderer',
          entries: { '.': { visibility: 'public', exports: ['Widget', 'render'] } },
        },
      ],
      features: [feature('compile', '@crudui/core', 'compile(spec) -> Template; open | close(template) -> Session')],
      examples: [],
      fixtures: [],
    },
    files: {
      'fixture.json': '{}\n',
      'check.test.mjs': '\n',
      'guide.md': "# Guide\n\n```js\nimport { compile } from '@crudui/core';\n```\n",
      'packages/core/package.json': JSON.stringify({
        name: '@crudui/core',
        exports: {
          '.': { types: './dist/index.d.ts', import: './dist/index.mjs', require: './dist/index.js' },
          './internal': { types: './dist/internal.d.ts', import: './dist/internal.mjs', require: './dist/internal.js' },
          './core.css': './styles/core.css',
          './package.json': './package.json',
        },
      }),
      'packages/core/src/index.ts': [
        "import type { Shape } from './shape';",
        "export { compile, open, close, helper as renamed } from './compile';",
        "export { Session } from './session';",
        "export type { Template } from './compile';",
        'export type { Shape };',
        "export interface Options { strict?: boolean }",
        '',
      ].join('\n'),
      'packages/core/src/compile.ts': [
        'export interface Template { id: string }',
        'export function compile(): Template { return { id: "" }; }',
        'export function open(): void {}',
        'export function close(): void {}',
        'export const helper = 1;',
        '',
      ].join('\n'),
      'packages/core/src/session.ts': 'export class Session {}\n',
      'packages/core/src/shape.ts': 'export class Shape {}\n',
      'packages/core/src/internal.ts': "export { layout } from './layout';\n",
      'packages/core/src/layout.ts': 'export function layout(): string { return "table"; }\n',
      'packages/view/package.json': JSON.stringify({
        name: '@crudui/view',
        exports: { '.': { types: './dist/index.d.ts', svelte: './dist/index.js' } },
      }),
      'packages/view/src/index.ts': [
        "import { layout } from '@crudui/core/internal';",
        "export type { Session } from '@crudui/core';",
        "export { default as Widget } from './Widget.svelte';",
        'export function render(): string { return layout(); }',
        '',
      ].join('\n'),
      'packages/view/src/Widget.svelte': '<p>widget</p>\n',
      'examples/app/main.mjs': "import { compile } from '@crudui/core';\nimport { render } from '@crudui/view';\n",
    },
  };
}

/** Write a synthetic repository, run the check on it and return its errors. */
function errorsFor(change = () => {}) {
  const repo = repository();
  change(repo);
  const root = mkdtempSync(path.join(tmpdir(), 'crudui-manifest-'));
  try {
    for (const [file, text] of Object.entries(repo.files)) {
      if (text === undefined) continue;
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), text);
    }
    mkdirSync(path.join(root, 'contracts'), { recursive: true });
    writeFileSync(path.join(root, 'contracts/features.json'), JSON.stringify(repo.manifest, null, 2));
    return checkContractManifest(root).errors;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const core = repo => repo.manifest.packages[0];

test('a synthetic repository with exact entries passes', () => {
  assert.deepEqual(errorsFor(), []);
});

test('a package.json code entry without a manifest entry fails', () => {
  assert.deepEqual(errorsFor(repo => { delete core(repo).entries['./internal']; }), [
    '@crudui/core: package.json code entry "./internal" is not declared in the manifest',
  ]);
});

test('a manifest entry without a package.json code entry fails', () => {
  assert.deepEqual(errorsFor(repo => { core(repo).entries['./extra'] = { visibility: 'internal', exports: [] }; }), [
    '@crudui/core: manifest entry "./extra" is not a package.json code entry',
  ]);
});

test('a package.json code entry without a source entry file fails', () => {
  assert.deepEqual(errorsFor(repo => { repo.files['packages/core/src/internal.ts'] = undefined; }), [
    '@crudui/core: package.json entry "./internal" has no source file for ./dist/internal.mjs',
  ]);
});

test('value exports that differ from the declaration fail in both directions', () => {
  assert.deepEqual(errorsFor(repo => {
    core(repo).entries['.'].exports = ['Session', 'Template', 'close', 'compile', 'open'];
  }), [
    '@crudui/core ".": exported but not declared: renamed',
    '@crudui/core ".": declared but not exported: Template',
  ]);
});

test('a declared export list must be sorted', () => {
  assert.deepEqual(errorsFor(repo => { core(repo).entries['.'].exports = ['compile', 'close', 'open', 'renamed', 'Session']; }), [
    '@crudui/core ".": exports must be sorted: Session, close, compile, open, renamed',
  ]);
});

test('an export that cannot be resolved fails', () => {
  assert.deepEqual(errorsFor(repo => {
    repo.files['packages/core/src/index.ts'] += "export { missing } from './compile';\n";
    core(repo).entries['.'].exports = ['Session', 'close', 'compile', 'missing', 'open', 'renamed'];
  }), [
    '@crudui/core ".": export cannot be resolved: missing',
  ]);
});

test('a function in an implemented feature signature must be a public export of its owner', () => {
  assert.deepEqual(errorsFor(repo => {
    repo.manifest.features[0].signature += '; layout() -> string; session.render() -> string';
  }), [
    'compile: signature function layout is not a public "." export of @crudui/core',
  ]);
  assert.deepEqual(errorsFor(repo => { core(repo).entries['.'].visibility = 'internal'; }), [
    'compile: signature function close is not a public "." export of @crudui/core',
    'compile: signature function compile is not a public "." export of @crudui/core',
    'compile: signature function open is not a public "." export of @crudui/core',
    'examples/app/main.mjs imports the internal entry @crudui/core',
    'guide.md imports the internal entry @crudui/core',
  ]);
  assert.deepEqual(errorsFor(repo => {
    repo.manifest.features[0].status = 'planned';
    repo.manifest.features[0].signature = 'later() -> void';
  }), []);
});

test('only CRUDUI package code imports an internal entry', () => {
  assert.deepEqual(errorsFor(repo => {
    repo.files['examples/app/main.mjs'] += "const { layout } = await import('@crudui/core/internal');\n";
    repo.files['tests/app.test.mjs'] = "const internal = require('@crudui/core/internal');\n";
    repo.files['guide.md'] += "\n```ts\nimport { layout } from '@crudui/core/internal';\n```\n";
    repo.files['packages/view/README.md'] = "```ts\nimport { layout } from \"@crudui/core/internal\";\n```\n";
    repo.files['packages/view/src/view.test.ts'] = "import { layout } from '@crudui/core/internal';\n";
  }), [
    'examples/app/main.mjs imports the internal entry @crudui/core/internal',
    'guide.md imports the internal entry @crudui/core/internal',
    'packages/view/README.md imports the internal entry @crudui/core/internal',
    'tests/app.test.mjs imports the internal entry @crudui/core/internal',
  ]);
});

test('a package that imports another package by a relative source path fails', () => {
  assert.deepEqual(errorsFor(repo => {
    repo.files['packages/view/src/index.ts'] += "export { layout as viewLayout } from '../../core/src/layout';\n";
    repo.files['packages/view/src/view.test.ts'] = [
      "import { compile } from '../../core/src/compile.ts';",
      "const internal = await import('../../core/src/internal.ts');",
      "vi.doMock('../../core/src/session.ts', () => ({}));",
      "import { render } from './index';",
      "import cases from '../../../fixture.json';",
      '',
    ].join('\n');
    repo.files['packages/view/bin/view.mjs'] = "const { layout } = await import(\"../../core/src/layout.ts\");\n";
    repo.files['packages/view/README.md'] = "```ts\nimport { layout } from '../core/src/layout';\n```\n";
    repo.files['examples/app/local.mjs'] = "import { layout } from '../../packages/core/src/layout.ts';\n";
    repo.manifest.packages[1].entries['.'].exports = ['Widget', 'render', 'viewLayout'];
  }), [
    "packages/view/bin/view.mjs imports another package's source: ../../core/src/layout.ts",
    "packages/view/src/index.ts imports another package's source: ../../core/src/layout",
    "packages/view/src/view.test.ts imports another package's source: ../../core/src/compile.ts",
    "packages/view/src/view.test.ts imports another package's source: ../../core/src/internal.ts",
    "packages/view/src/view.test.ts imports another package's source: ../../core/src/session.ts",
  ]);
});

test('the repository manifest matches every package entry', () => {
  assert.deepEqual(checkContractManifest(ROOT).errors, []);
  for (const pkg of realManifest.packages) {
    for (const [entry, { visibility }] of Object.entries(pkg.entries)) {
      if (entry === '.') assert.equal(visibility, 'public', pkg.name);
    }
  }
});

test('a named error of an implemented feature is a built-in error or a public CRUDUI export', () => {
  assert.deepEqual(errorsFor(repo => {
    repo.manifest.features[0].errors = ['RangeError', 'Session', 'MissingError', 'Widget', 'Input must be an object'];
  }), [
    'compile: error MissingError is neither a JavaScript built-in error nor a public "." export of a CRUDUI package',
  ]);
  assert.deepEqual(errorsFor(repo => {
    repo.manifest.features[0].status = 'planned';
    repo.manifest.features[0].errors = ['LaterError'];
  }), []);
});
