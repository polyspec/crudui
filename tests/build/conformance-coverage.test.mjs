import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = async relative => JSON.parse(await readFile(path.join(ROOT, relative), 'utf8'));
const readText = async relative => readFile(path.join(ROOT, relative), 'utf8');
const matrix = await readJson('contracts/conformance-matrix.json');
const features = await readJson('contracts/features.json');

function unique(values, label) {
  assert.equal(new Set(values).size, values.length, `${label} contains duplicate targets`);
}

function fixtureCount(value) {
  return Array.isArray(value) ? value.length : Object.keys(value).length;
}

test('conformance matrix is structurally complete and fixture counts are current', async () => {
  assert.equal(matrix.format, 'crudui/conformance-matrix');
  assert.equal(matrix.version, '0.0.1');
  for (const [name, group] of Object.entries(matrix)) {
    if (!group || typeof group !== 'object' || !group.targets) continue;
    unique(group.targets, name);
    for (const surface of group.surfaces ?? []) {
      const actual = fixtureCount(await readJson(surface.fixture));
      assert.equal(actual, surface.count, `${name}/${surface.id} fixture count changed`);
      assert.ok((await readText(surface.test)).includes(surface.fixture),
        `${name}/${surface.id} test does not reference its declared fixture`);
    }
    for (const fixture of group.fixtures ?? []) {
      const actual = fixtureCount(await readJson(fixture.path));
      assert.equal(actual, fixture.count, `${name}/${fixture.id} fixture count changed`);
    }
  }
});

test('every declared pass target is represented in its conformance target set', async () => {
  const native = new Set(matrix.nativeGenerator.targets);
  const renderer = new Set(matrix.renderGateway.targets);
  const browser = new Set(matrix.browserSession.targets);
  const targetMap = {
    javascript: 'javascript',
    'javascript-dom': 'javascript-dom',
    'javascript-html': 'html',
    react: 'react',
    vue: 'vue',
    svelte: 'svelte',
    php: 'php',
    go: 'go',
    rust: 'rust',
    'php-native': 'php-native',
  };
  for (const feature of features.features) {
    for (const [target, support] of Object.entries(feature.support ?? {})) {
      if (support !== 'pass' || feature.id.startsWith('validate')) continue;
      const targetSet = feature.id === 'connectForm' || feature.id === 'connectOutline'
        ? browser : new Set([...native, ...renderer]);
      const covered = targetSet.has(targetMap[target]);
      assert.ok(covered, `${feature.id} declares ${target}=pass without conformance target coverage`);
    }
  }
  const validationTargets = new Set([
    ...matrix.validationGateway.targets.map(target => target === 'js' ? 'javascript' : target),
    ...matrix.validationExtension.targets,
  ]);
  for (const feature of features.features.filter(item => item.id.startsWith('validate') || item.id === 'validate')) {
    for (const [target, support] of Object.entries(feature.support ?? {})) {
      if (support === 'pass') assert.ok(validationTargets.has(target), `${feature.id} declares ${target}=pass without validation coverage`);
    }
  }
});

test('gateway and native runner sources expose every matrix target and operation surface', async () => {
  for (const groupName of ['validationGateway', 'validationExtension', 'renderGateway']) {
    const group = matrix[groupName];
    const sourceByTest = new Map();
    for (const surface of group.surfaces) {
      if (!sourceByTest.has(surface.test)) sourceByTest.set(surface.test, await readText(surface.test));
    }
  for (const [testPath, source] of sourceByTest) {
      const labels = { js: ['js', 'JavaScript'], php: ['php', 'PHP'], go: ['go', 'Go'], rust: ['rust', 'Rust'], html: ['html', 'HTML'], react: ['react', 'React'], svelte: ['svelte', 'Svelte'], vue: ['vue', 'Vue'], 'php-native': ['php-native', 'native'] };
      for (const target of group.targets) assert.ok(labels[target].some(label => source.includes(label)),
        `${testPath} does not name matrix target ${target}`);
    }
  }
  const browserSources = await Promise.all(matrix.browserSession.tests.map(readText));
  for (const target of matrix.browserSession.targets) {
    const labels = { 'javascript-dom': ['javascript', 'JavaScript', 'dom'], react: ['react', 'React'], svelte: ['svelte', 'Svelte'], vue: ['vue', 'Vue'] };
    assert.ok(browserSources.some(source => labels[target].some(label => source.includes(label))),
      `browser session tests do not name matrix target ${target}`);
  }
  const nativeSource = await readText(matrix.nativeGenerator.test);
  for (const target of matrix.nativeGenerator.targets) {
    assert.match(nativeSource, new RegExp(`name: ['"]${target}['"]`),
      `native runner does not declare matrix target ${target}`);
  }
  for (const operation of ['compileForm', 'bindForm', 'form', 'renderList', 'buildList', 'buildDetail', 'renderDetail']) {
    assert.ok(nativeSource.includes(operation),
      `native runner does not exercise operation ${operation}`);
  }
});
