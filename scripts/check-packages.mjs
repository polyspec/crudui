import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const directory = mkdtempSync(join(tmpdir(), 'crudui-consumer-'));
const packages = ['validator-ts', 'generator-core', 'generator-react', 'generator-vue', 'generator-svelte'];
const dependencies = {};
const { allowScripts } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
console.log(`Consumer project: ${directory}`);
function run(command, args, cwd = directory) {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
try {
  for (const folder of packages) {
    const source = join(root, 'packages', folder);
    const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
    assert.equal(manifest.version, '0.0.1', manifest.name);
    const packed = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', directory], source));
    dependencies[manifest.name] = `file:${join(directory, packed[0].filename)}`;
  }
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
  writeFileSync(join(directory, 'install.log'), run('npm', ['install']));
  for (const name of Object.keys(dependencies).filter(name => name.startsWith('@crudui/'))) {
    const base = join(directory, 'node_modules', name);
    const manifest = JSON.parse(readFileSync(join(base, 'package.json'), 'utf8'));
    const check = value => {
      if (typeof value === 'string') assert.ok(existsSync(resolve(base, value)), `${name}: ${value}`);
      else for (const child of Object.values(value)) check(child);
    };
    check(manifest.exports);
  }
  writeFileSync(join(directory, 'typecheck.log'), run(join(directory, 'node_modules/.bin/tsc'), ['--noEmit']));
  writeFileSync(join(directory, 'build.log'), run(join(directory, 'node_modules/.bin/vite'), ['build']));
  const consumerRequire = createRequire(join(directory, 'package.json'));
  const { preview } = await import(pathToFileURL(consumerRequire.resolve('vite')).href);
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
  console.log('Package exports, consumer types, production build and three-framework browser checks passed.');
} catch (error) {
  const detail = [error.message, error.stdout, error.stderr].filter(Boolean).join('\n');
  writeFileSync(join(directory, 'failure.log'), detail);
  console.error(detail);
  process.exitCode = 1;
}
