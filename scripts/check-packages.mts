import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';
import { createRequire } from 'node:module';
import { installLock, type LockPackages, type PackedManifest, type PackedPackage } from './install-lock.mts';
import { packPackage } from './package-install-pack.mts';
import { createProgress } from '@polyspec/kit/test-progress';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const directory = mkdtempSync(join(tmpdir(), 'crudui-install-'));
const packages = ['validator/ts', 'generator/ts', 'html', 'react', 'vue', 'svelte', 'form-binding'];
// contracts/features.json records every published npm package; the install project installs all of them.
const published = (JSON.parse(readFileSync(join(root, 'contracts/features.json'), 'utf8')) as { packages: { path: string }[] }).packages
  .map(({ path }) => relative(join(root, 'packages'), join(root, path)));
const dependencies: Record<string, string> = {};
// The packed packages for the install lock (scripts/install-lock.mts).
const packed: Record<string, PackedPackage> = {};
const { allowScripts } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { allowScripts?: unknown };
process.stdout.write(`Install project: ${directory}\n`);

/*
 * Each step reports its start, its result and its elapsed time while the check runs,
 * and each step carries its own limit sized from its measured duration (macOS, warm
 * caches): packing 2.2 s, installing 6.4 s, exports 0.1 s, server rendering 2.5 s,
 * types 2.7 s, production build 1.8 s and the browser check 4.2 s.
 */
/** A value of the `exports` map of a package.json: a path, or conditions and subpaths that lead to paths. */
type ExportTarget = string | { [key: string]: ExportTarget };

const lines = createProgress({ write: text => process.stdout.write(text) });
async function step<T>(label: string, budget: number, operation: (budget: number) => T | Promise<T>): Promise<T> {
  const id = `${label} (limit ${budget / 1000}s)`;
  lines.start(id);
  commandTimeout = budget;
  try {
    const value = await operation(budget);
    lines.pass(id);
    return value;
  } catch (error) {
    lines.fail(id, undefined, (error as Error).message);
    throw error;
  }
}
// A step's limit is also the limit of each command it runs: an unresponsive command is
// killed and named instead of stopping the whole check without a report.
let commandTimeout = 120000;
// Commands run asynchronously, so the progress lines keep reporting while one runs.
// `input`, when given, is written to the command's standard input.
function run(command: string, args: string[], cwd: string = directory, input: string | undefined = undefined): Promise<string> {
  const started = Date.now();
  return new Promise<string>((resolve, reject) => {
    const child = execFile(command, args, { cwd, encoding: 'utf8', timeout: commandTimeout, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (!error) return resolve(stdout);
      if (error.signal === 'SIGKILL') error.message = `${command} ${args.join(' ')} ran ${Date.now() - started} ms and exceeded its ${commandTimeout} ms limit`;
      Object.assign(error, { stdout, stderr });
      reject(error);
    });
    assert.ok(child.stdin);
    child.stdin.end(input);
  });
}
try {
  await step(`pack ${packages.length} packages`, 60000, async () => {
  assert.deepEqual([...packages].sort(), [...published].sort(), 'the install check packs every published package');
  for (const folder of packages) {
    const source = join(root, 'packages', folder);
    const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')) as PackedManifest;
    assert.equal(manifest.version, '0.0.5', manifest.name);
    const tarball = await packPackage(source, directory, manifest.name, run);
    dependencies[manifest.name] = `file:${tarball}`;
    packed[manifest.name] = { directory: `packages/${folder}`, tarball, manifest };
  }
  });
  for (const name of ['react', 'react-dom', 'vue', 'svelte', 'typescript', '@types/react', '@types/react-dom', '@types/node', 'vite', '@sveltejs/vite-plugin-svelte']) {
    const version = ['vite', '@sveltejs/vite-plugin-svelte'].includes(name)
      ? (JSON.parse(readFileSync(join(root, 'packages/svelte/package.json'), 'utf8')) as { devDependencies: Record<string, string> }).devDependencies[name]
      : (require(`${name}/package.json`) as { version: string }).version;
    assert.ok(version !== undefined, name);
    dependencies[name] = version;
  }
  const project = { name: 'crudui-install-check', version: '0.0.1', private: true, type: 'module', dependencies, allowScripts };
  writeFileSync(join(directory, 'package.json'), JSON.stringify(project, null, 2));
  // The install project installs the releases of the root lock from the npm cache that make install fills, without a registry.
  const rootLock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')) as { packages?: LockPackages };
  writeFileSync(join(directory, 'package-lock.json'), `${JSON.stringify(installLock({ rootLock, manifest: project, packed }), null, 2)}\n`);
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
import { Form as ReactForm, type AnyWidget as ReactAnyWidget } from '@polyspec/crudui-generator-react';
import { Form as VueForm, type AnyWidget as VueAnyWidget } from '@polyspec/crudui-generator-vue';
import { Form as SvelteForm } from '@polyspec/crudui-generator-svelte';
import { renderForm } from '@polyspec/crudui-generator-html';
import { bindForm } from '@polyspec/crudui-form-binding';
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
// The server-rendered form that the browser validation binding validates before submission.
const bindingSpec = { type: 'group', properties: { email: { type: 'email', label: 'Email', validate: { required: true } } } };
document.getElementById('binding')!.innerHTML = renderForm(
  createForm(compileForm(bindingSpec, { keyPrefix: 'form' }), {}, { idPrefix: 'binding', language: 'en' }),
  { action: { method: 'post', url: '/submit' } },
);
bindForm(document.querySelector<HTMLFormElement>('#binding form')!, bindingSpec, { keyPrefix: 'form' });
`);
  writeFileSync(join(directory, 'api.ts'), `export { compileForm, createForm } from '@polyspec/crudui-generator-core';\nexport { validate } from '@polyspec/crudui-validator';\n`);
  writeFileSync(join(directory, 'index.html'), '<!doctype html><html><head><title>Package verification</title><link rel="icon" href="data:,"></head><body><div id="react"></div><div id="vue"></div><div id="svelte"></div><div id="binding"></div><script type="module" src="/main.ts"></script></body></html>');
  writeFileSync(join(directory, 'vite.config.mjs'), `import { defineConfig } from 'vite';\nimport { svelte } from '@sveltejs/vite-plugin-svelte';\nexport default defineConfig({ plugins: [svelte()] });\n`);
  await step('install the packages of the install project', 120000,
    async () => writeFileSync(join(directory, 'install.log'), await run('npm', ['ci', '--offline'])));
  await step('verify package exports', 10000, () => {
  for (const name of Object.keys(dependencies).filter(name => name.startsWith('@polyspec/crudui-'))) {
    const base = join(directory, 'node_modules', name);
    const manifest = JSON.parse(readFileSync(join(base, 'package.json'), 'utf8')) as { exports: ExportTarget };
    const check = (value: ExportTarget): void => {
      if (typeof value === 'string') assert.ok(existsSync(resolve(base, value)), `${name}: ${value}`);
      else for (const child of Object.values(value)) check(child);
    };
    check(manifest.exports);
    assert.ok(!Object.hasOwn(manifest, 'bin'), `${name}: a published package must not declare bin`);
  }
  });
  // Server rendering from the installed entries: each framework package renders a form, a list and a detail.
  const rendering = `
const form = core.createForm(core.compileForm({ type: 'group', properties: { name: { type: 'text', label: 'Name' } } }), { name: 'Ada' });
const html = [
  await m.renderForm(form),
  await m.renderList({ columns: { name: { field: '.name', label: 'Name' } } }, [{ name: 'Ada' }], { language: 'en' }),
  await m.renderDetail({ fields: { name: { field: '.name', label: 'Name' } } }, { name: 'Ada' }, { language: 'en' }),
];
if (!html.every(part => part.includes('Ada'))) throw new Error('server rendering lost the data');`;
  const installRequire = createRequire(join(directory, 'package.json'));
  const { preview } = await step('render on the server from the installed entries', 60000, async () => {
  for (const name of ['@polyspec/crudui-generator-react/server', '@polyspec/crudui-generator-vue']) {
    await run('node', ['--input-type=module', '-e', `const core = await import('@polyspec/crudui-generator-core');const m = await import('${name}');${rendering}`]);
    await run('node', ['-e', `(async () => { const core = require('@polyspec/crudui-generator-core');const m = require('${name}');${rendering} })().catch(error => { console.error(error); process.exit(1); });`]);
  }
  writeFileSync(join(directory, 'render.mjs'), `import * as core from '@polyspec/crudui-generator-core';\nimport * as m from '@polyspec/crudui-generator-svelte';\nexport async function render() {${rendering}\n}\n`);
  // The vite of the install project: the release that the root package.json pins.
  const vite = await import(pathToFileURL(installRequire.resolve('vite')).href) as typeof import('vite');
  const renderer = await vite.createServer({ root: directory, logLevel: 'silent', server: { middlewareMode: true } });
  try {
    await (await renderer.ssrLoadModule('/render.mjs')).render();
  } finally {
    await renderer.close();
  }
  return vite;
  });
  await step('type-check the install project', 60000,
    async () => writeFileSync(join(directory, 'typecheck.log'), await run(join(directory, 'node_modules/.bin/tsc'), ['--noEmit'])));
  await step('build the install project', 60000,
    async () => writeFileSync(join(directory, 'build.log'), await run(join(directory, 'node_modules/.bin/vite'), ['build'])));
  await step('run the three-framework and form binding browser check', 60000, async () => {
  const server = await preview({ root: directory, preview: { host: '127.0.0.1', port: 0, open: false } });
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error instanceof Error ? error.message : String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const url = server.resolvedUrls?.local[0];
    assert.ok(url, 'the preview server must report its local URL');
    await page.goto(url);
    await page.waitForFunction(() => ['react', 'vue', 'svelte'].every(id =>
      document.querySelector<HTMLInputElement>(`#${id} input`)?.value === 'Packaged form'));
    for (const framework of ['react', 'vue', 'svelte']) {
      await page.click(`#${framework} label`);
      assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'INPUT');
      await page.keyboard.press('End');
      await page.type(`#${framework} input`, '!');
      assert.equal(await page.$eval(`#${framework} input`, element => element.value), 'Packaged form!');
    }
    // The bound form stops an invalid submission: it shows the required error and focuses the control.
    await page.click('#binding button[type="submit"]');
    assert.deepEqual(await page.$$eval('#binding .crudui-node__error', elements => elements.map(element => element.textContent)), ['This field is required.']);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('name')), 'form[email]');
    assert.deepEqual(errors, []);
    await page.screenshot({ path: join(directory, 'browser.png'), fullPage: true });
    writeFileSync(join(directory, 'browser.json'), JSON.stringify({ frameworks: ['react', 'vue', 'svelte'], labels: true, typing: true, binding: true, pageErrors: errors }, null, 2));
  } finally {
    await browser?.close();
    await new Promise(resolve => server.httpServer.close(resolve));
  }
  });
  lines.close('package install checks');
  // A passing check removes its install project; a failing check keeps it for inspection.
  rmSync(directory, { recursive: true, force: true });
} catch (error) {
  // A failed step throws an Error; a failed command adds its output to it.
  const failure = error as Error & { stdout?: string, stderr?: string };
  const detail = [failure.message, failure.stdout, failure.stderr].filter(Boolean).join('\n');
  writeFileSync(join(directory, 'failure.log'), detail);
  console.error(detail);
  console.error(`Install project retained: ${directory}`);
  lines.close('package install checks');
  process.exitCode = 1;
}
