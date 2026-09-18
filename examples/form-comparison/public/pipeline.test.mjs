import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('./main.mjs', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');

test('the public entry delegates navigation to CRUDUI generated links', () => {
  assert.doesNotMatch(html + script, /data-stage|stage=|List refresh/);
  assert.doesNotMatch(html + script, /\/displays\//);
});

test('the public entry declares the complete runtime selection', () => {
  for (const server of ['js', 'php', 'php-ext', 'go', 'rust']) assert.match(html, new RegExp(`value="${server}"`));
  for (const framework of ['html', 'react', 'vue', 'svelte']) assert.match(html, new RegExp(`value="${framework}"`));
  for (const initialization of ['csr', 'ssr']) assert.match(html, new RegExp(`value="${initialization}"`));
  for (const mode of ['bindForm', 'createForm']) assert.match(html, new RegExp(`value="${mode}"`));
});

test('the canonical page has a real link back to the list and no comparison columns', () => {
  assert.match(html, /data-view="list"/);
  assert.doesNotMatch(html, /id="ssr"|id="csr"/);
});

test('SSR page rendering is a server document contract, not a client-only flag', () => {
  assert.match(server, /data-pipeline-initialization/);
  assert.match(script, /dataset\.pipelineInitialization/);
});

test('runtime selection writes the newly selected initialization into the navigation URL', () => {
  assert.match(script, /state\[control\] = event\.target\.value/);
  assert.match(script, /location\.href = `\$\{location\.pathname\}\?\$\{params/);
  assert.match(script, /initialization: state\.initialization/);
  assert.match(script, /mode: state\.mode/);
});

test('the canonical page renders the stage itself and reports readiness by one event', () => {
  assert.doesNotMatch(html + script, /<iframe|frame-readiness|crudui:main-ready|crudui:pipeline-saved/);
  assert.equal(script.includes('setTimeout'), false);
  assert.match(script, /type: 'crudui:pipeline-ready', view, server: state\.server, framework: state\.framework,/);
  assert.match(script, /initialization: state\.initialization, mode: state\.mode, page: state\.page, id,/);
  assert.match(script, /import\(`\/pages\/\$\{encodeURIComponent\(state\.framework\)\}\/stage\.js`\)/);
});

test('the canonical record form keeps the browser constraint validation', async () => {
  const stage = await readFile(new URL('../src/pages/stage.mjs', import.meta.url), 'utf8');
  for (const [name, source] of [['index.html', html], ['main.mjs', script], ['stage.mjs', stage], ['server.mjs', server]]) {
    assert.doesNotMatch(source, /novalidate|noValidate|formnovalidate/i, `${name} turns constraint validation off`);
  }
});

test('page styles never reach the CRUDUI output, which takes every style from crudui.css', async () => {
  // A rule whose subject is a bare element (`button`, `p`, `a`, ...) matches CRUDUI's own
  // controls too, so it must exclude both hosts of CRUDUI output: the frame view and the stage.
  const css = (await readFile(new URL('./comparison.css', import.meta.url), 'utf8'))
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{/g, '');
  const leaking = [];
  for (const [, selectors] of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    for (const selector of selectors.split(/,(?![^(]*\))/).map(item => item.trim()).filter(Boolean)) {
      const subject = selector.replace(/\([^()]*\)/g, '()').split(/\s*[\s>+~]\s*/).at(-1);
      if (/^[a-z][a-z0-9]*\b/.test(subject) && !['html', 'body'].includes(subject.match(/^[a-z0-9]+/)[0])
          && !/^(?:#|\.)/.test(selector) && !selector.includes(':not(#view *, #stage *)')) {
        leaking.push(selector);
      }
    }
  }
  assert.deepEqual(leaking, [], 'element rules that reach CRUDUI output');
});
