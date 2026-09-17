import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';
import { createRequire } from 'node:module';
import { packPackage } from './package-consumer-pack.mjs';
import { createProgress } from './test-progress/progress.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const directory = mkdtempSync(join(tmpdir(), 'crudui-consumer-'));
const packages = ['validator-ts', 'generator-core', 'generator-html', 'generator-react', 'generator-vue', 'generator-svelte'];
const dependencies = {};
const { allowScripts } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
console.log(`Consumer project: ${directory}`);

/*
 * Each step reports its start, its result and its elapsed time while the check runs,
 * and each step carries its own limit sized from its measured duration (macOS, warm
 * caches): packing 2.2 s, installing 6.4 s, exports 0.1 s, server rendering 2.5 s,
 * types 2.7 s, production build 1.8 s and the browser check 4.2 s.
 */
const lines = createProgress({ write: text => process.stdout.write(text) });
async function step(label, budget, operation) {
  const id = `${label} (limit ${budget / 1000}s)`;
  lines.start(id);
  commandTimeout = budget;
  try {
    const value = await operation(budget);
    lines.pass(id);
    return value;
  } catch (error) {
    lines.fail(id, undefined, error.message);
    throw error;
  }
}
// A step's limit is also the limit of each command it runs: an unresponsive command is
// killed and named instead of stopping the whole check without a report.
let commandTimeout = 120000;
// Commands run asynchronously, so the progress lines keep reporting while one runs.
function run(command, args, cwd = directory) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd, encoding: 'utf8', timeout: commandTimeout, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (!error) return resolve(stdout);
      if (error.signal === 'SIGKILL') error.message = `${command} ${args.join(' ')} exceeded its ${commandTimeout} ms limit`;
      Object.assign(error, { stdout, stderr });
      reject(error);
    });
  });
}
try {
  await step(`pack ${packages.length} packages`, 60000, async () => {
  for (const folder of packages) {
    const source = join(root, 'packages', folder);
    const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
    assert.equal(manifest.version, '0.0.1', manifest.name);
    dependencies[manifest.name] = `file:${await packPackage(
      source, directory, manifest.name, run,
    )}`;
  }
  });
  for (const name of ['react', 'react-dom', 'vue', 'svelte', 'typescript', '@types/react', '@types/react-dom', '@types/node', 'vite', '@sveltejs/vite-plugin-svelte']) {
    dependencies[name] = ['vite', '@sveltejs/vite-plugin-svelte'].includes(name)
      ? JSON.parse(readFileSync(join(root, 'packages/generator-svelte/package.json'), 'utf8')).devDependencies[name]
      : require(`${name}/package.json`).version;
  }
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: 'crudui-consumer-check', version: '0.0.1', private: true, type: 'module', dependencies, allowScripts }, null, 2));
  writeFileSync(join(directory, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', strict: true, noEmit: true,
    esModuleInterop: true, lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  }, include: ['main.ts'] }, null, 2));
  writeFileSync(join(directory, 'main.ts'), `
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { createApp, h } from 'vue';
import { mount } from 'svelte';
import { compileForm, createForm, validate } from './api';
import { Form as ReactForm, type AnyWidget as ReactAnyWidget } from '@crudui/generator-react';
import { Form as VueForm, type AnyWidget as VueAnyWidget } from '@crudui/generator-vue';
import { Form as SvelteForm } from '@crudui/generator-svelte';
type FrameworkWidgetTypes = [ReactAnyWidget, VueAnyWidget];
const frameworkWidgetTypes: FrameworkWidgetTypes | undefined = undefined;
void frameworkWidgetTypes;
const spec = { type: 'group', properties: { name: { type: 'text', label: 'Name' } } };
const template = compileForm(spec);
const data = { name: 'Packaged form' };
const reactForm = createForm(template, data, { idPrefix: 'react' });
const vueForm = createForm(template, data, { idPrefix: 'vue' });
const svelteForm = createForm(template, data, { idPrefix: 'svelte' });
createRoot(document.getElementById('react')!).render(createElement(ReactForm, { form: reactForm }));
createApp({ render: () => h(VueForm, { form: vueForm }) }).mount('#vue');
mount(SvelteForm, { target: document.getElementById('svelte')!, props: { form: svelteForm } });
validate(spec, data);
`);
  writeFileSync(join(directory, 'api.ts'), `export { compileForm, createForm } from '@crudui/generator-core';\nexport { validate } from '@crudui/validator';\n`);
  writeFileSync(join(directory, 'index.html'), '<!doctype html><html><head><title>Package verification</title><link rel="icon" href="data:,"></head><body><div id="react"></div><div id="vue"></div><div id="svelte"></div><script type="module" src="/main.ts"></script></body></html>');
  writeFileSync(join(directory, 'vite.config.mjs'), `import { defineConfig } from 'vite';\nimport { svelte } from '@sveltejs/vite-plugin-svelte';\nexport default defineConfig({ plugins: [svelte()] });\n`);
  await step('install the consumer project', 120000,
    async () => writeFileSync(join(directory, 'install.log'), await run('npm', ['install'])));
  await step('verify package exports', 10000, () => {
  for (const name of Object.keys(dependencies).filter(name => name.startsWith('@crudui/'))) {
    const base = join(directory, 'node_modules', name);
    const manifest = JSON.parse(readFileSync(join(base, 'package.json'), 'utf8'));
    const check = value => {
      if (typeof value === 'string') assert.ok(existsSync(resolve(base, value)), `${name}: ${value}`);
      else for (const child of Object.values(value)) check(child);
    };
    check(manifest.exports);
  }
  });
  // Server rendering from the installed entries: each framework package renders a form, a list and a detail.
  const rendering = `
const form = m.createForm(m.compileForm({ type: 'group', properties: { name: { type: 'text', label: 'Name' } } }), { name: 'Ada' });
const html = [
  await m.renderForm(form),
  await m.renderList({ columns: { name: { field: '.name', label: 'Name' } } }, [{ name: 'Ada' }], { language: 'en' }),
  await m.renderDetail({ fields: { name: { field: '.name', label: 'Name' } } }, { name: 'Ada' }, { language: 'en' }),
];
if (!html.every(part => part.includes('Ada'))) throw new Error('server rendering lost the data');`;
  const consumerRequire = createRequire(join(directory, 'package.json'));
  const { createServer, preview } = await step('render on the server from the installed entries', 60000, async () => {
  for (const name of ['@crudui/generator-react', '@crudui/generator-vue']) {
    await run('node', ['--input-type=module', '-e', `const m = await import('${name}');${rendering}`]);
    await run('node', ['-e', `(async () => { const m = require('${name}');${rendering} })().catch(error => { console.error(error); process.exit(1); });`]);
  }
  writeFileSync(join(directory, 'render.mjs'), `import * as m from '@crudui/generator-svelte';\nexport async function render() {${rendering}\n}\n`);
  const vite = await import(pathToFileURL(consumerRequire.resolve('vite')).href);
  const renderer = await vite.createServer({ root: directory, logLevel: 'silent', server: { middlewareMode: true } });
  try {
    await (await renderer.ssrLoadModule('/render.mjs')).render();
  } finally {
    await renderer.close();
  }
  return vite;
  });
  await step('type-check the consumer project', 60000,
    async () => writeFileSync(join(directory, 'typecheck.log'), await run(join(directory, 'node_modules/.bin/tsc'), ['--noEmit'])));
  await step('build the consumer project', 60000,
    async () => writeFileSync(join(directory, 'build.log'), await run(join(directory, 'node_modules/.bin/vite'), ['build'])));
  await step('run the three-framework browser check', 60000, async () => {
  const server = await preview({ root: directory, preview: { host: '127.0.0.1', port: 0, open: false } });
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(() => ['react', 'vue', 'svelte'].every(id =>
      document.querySelector(`#${id} input`)?.value === 'Packaged form'));
    for (const framework of ['react', 'vue', 'svelte']) {
      await page.click(`#${framework} label`);
      assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'INPUT');
      await page.keyboard.press('End');
      await page.type(`#${framework} input`, '!');
      assert.equal(await page.$eval(`#${framework} input`, element => element.value), 'Packaged form!');
    }
    assert.deepEqual(errors, []);
    await page.screenshot({ path: join(directory, 'browser.png'), fullPage: true });
    writeFileSync(join(directory, 'browser.json'), JSON.stringify({ frameworks: ['react', 'vue', 'svelte'], labels: true, typing: true, pageErrors: errors }, null, 2));
  } finally {
    await browser?.close();
    await new Promise(resolve => server.httpServer.close(resolve));
  }
  });
  lines.close('package consumer checks');
  // A passing check removes its consumer project; a failing check keeps it for inspection.
  rmSync(directory, { recursive: true, force: true });
} catch (error) {
  const detail = [error.message, error.stdout, error.stderr].filter(Boolean).join('\n');
  writeFileSync(join(directory, 'failure.log'), detail);
  console.error(detail);
  console.error(`Consumer project retained: ${directory}`);
  lines.close('package consumer checks');
  process.exitCode = 1;
}
