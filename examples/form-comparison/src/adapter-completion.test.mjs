import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const adapterFiles = {
  'create-form/react': './adapters/create-form-react.tsx',
  'create-form/vue': './adapters/create-form-vue.ts',
  'create-form/svelte': './adapters/create-form-svelte.svelte.ts',
  'create-form/html': './adapters/create-form-html.ts',
  'bind-form/react': './adapters/bind-form-react.tsx',
  'bind-form/vue': './adapters/bind-form-vue.ts',
  'bind-form/svelte': './adapters/bind-form-svelte.svelte.ts',
  'bind-form/html': './adapters/bind-form-html.ts',
};
const sources = Object.fromEntries(await Promise.all(
  [['frame', './frame.mjs'], ...Object.entries(adapterFiles)].map(async ([name, file]) => [
    name, await readFile(new URL(file, import.meta.url), 'utf8'),
  ]),
));

test('every adapter offers both initialization paths and declares what hydration does', () => {
  for (const [name, source] of Object.entries(adapterFiles).map(([name]) => [name, sources[name]])) {
    assert.match(source, /export function mountView\(views, template, language, data = \{\}\)/, `${name} mounts`);
    assert.match(source, /export function hydrateView\(views, template, language, data\)/, `${name} hydrates`);
    const declaration = /export const hydration = '(keep|replace)'/.exec(source);
    assert.ok(declaration, `${name} must declare whether hydration keeps the server nodes`);
    assert.equal(declaration[1], name.endsWith('svelte') ? 'replace' : 'keep', `${name} hydration`);
    assert.equal(source.includes('setTimeout'), false, `${name} must not wait on timers`);
  }
});

test('create-form adapters publish framework rendering completion', () => {
  assert.equal(sources.frame.includes('requestAnimationFrame'), false,
    'the frame must not infer renderer completion from animation frames');
  for (const framework of ['react', 'vue', 'svelte', 'html']) {
    assert.match(sources[`create-form/${framework}`], /idle:/, `${framework} must publish renderer completion`);
  }
  assert.match(sources['create-form/react'], /flushSync/);
  assert.match(sources['create-form/vue'], /nextTick/);
  assert.match(sources['create-form/svelte'], /flushSync/);
  // The HTML renderer writes markup synchronously, so rendering is complete when a change returns.
  assert.match(sources['create-form/html'], /session\.subscribe\(\(\) => \{\s*render\(\);\s*connection\.sync\(\);/);
});

test('hydration completion comes from the framework, not from waiting', () => {
  // React hydrates asynchronously: an effect of the hydrated tree reports the commit.
  for (const name of ['create-form/react', 'bind-form/react']) {
    assert.match(sources[name], /hydrateRoot\(views\.form/, `${name} hydrates the form container`);
    assert.match(sources[name], /React\.useEffect\(onCommit/, `${name} reports its commit`);
    assert.match(sources[name], /onRecoverableError/, `${name} must fail on a hydration mismatch`);
  }
  // Vue hydrates synchronously when the application is created for server-rendered markup.
  for (const name of ['create-form/vue', 'bind-form/vue']) {
    assert.match(sources[name], /createSSRApp/, `${name} hydrates the server markup`);
  }
  // Svelte reads its own hydration markers, which the form servers do not write.
  for (const name of ['create-form/svelte', 'bind-form/svelte']) {
    assert.match(sources[name], /views\.form\.replaceChildren\(\)/, `${name} replaces the server nodes`);
  }
});
