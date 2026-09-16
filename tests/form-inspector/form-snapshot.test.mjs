import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { compareSnapshots, formSnapshot, renderedFormSnapshot, renderedViews } from './form-snapshot.mjs';

function fixture() {
  const { window } = new JSDOM('<form><div class="row" data-key="__0000000000005__"><label>Name</label><input name="form[name]" value="Saved"><input name="form[enabled]" type="checkbox" checked><textarea name="form[notes]">Notes</textarea><select name="form[category]"><option value="a" selected>A</option><option value="b">B</option></select></div><div class="row" data-key="__0000000000001__">Second<!-- kept --></div></form>');
  const form = window.document.querySelector('form');
  return { window, form, snapshot: () => formSnapshot(form, form) };
}

test('identical forms pass every category without changing the DOM', () => {
  const { form, snapshot } = fixture();
  const html = form.outerHTML;
  const expected = snapshot();
  assert.ok(compareSnapshots(snapshot(), expected).every(result => result.passed));
  assert.equal(form.outerHTML, html);
});

test('attribute order changes raw HTML but preserves parsed DOM equality', () => {
  const { form, snapshot } = fixture();
  const expected = snapshot();
  const expectedNode = form.cloneNode(true);
  const row = form.firstElementChild;
  row.removeAttribute('class');
  row.setAttribute('class', 'row');
  const actual = snapshot();
  const results = compareSnapshots(actual, expected);
  assert.equal(results.find(result => result.category === 'html').passed, false);
  assert.equal(results.find(result => result.category === 'dom').passed, true);
  assert.ok(form.isEqualNode(expectedNode));
});

for (const [name, change] of [
  ['missing attribute', form => form.firstElementChild.removeAttribute('data-key')],
  ['changed row key', form => form.firstElementChild.setAttribute('data-key', '__0000000000007__')],
  ['class value', form => form.firstElementChild.classList.add('changed')],
  ['hidden attribute', form => { form.firstElementChild.hidden = true; }],
  ['empty style attribute', form => form.firstElementChild.setAttribute('style', '')],
  ['inline style', form => { form.firstElementChild.style.display = 'none'; }],
  ['text', form => { form.querySelector('label').textContent = 'Changed'; }],
  ['comment', form => { form.lastElementChild.lastChild.data = 'changed'; }],
  ['child order', form => form.prepend(form.lastElementChild)],
  ['missing child', form => form.lastElementChild.remove()],
]) test(`detects ${name}`, () => {
  const { form, snapshot } = fixture();
  const expected = snapshot();
  change(form);
  const results = compareSnapshots(snapshot(), expected);
  assert.equal(results.find(result => result.category === 'dom').passed, false);
  assert.equal(results.find(result => result.category === 'html').passed, false);
});

for (const [name, change] of [
  ['input value', form => { form.querySelector('input').value = 'Edited'; }],
  ['checked property', form => { form.querySelector('[type=checkbox]').checked = false; }],
  ['textarea value', form => { form.querySelector('textarea').value = 'Edited'; }],
  ['selected option', form => { form.querySelector('select').value = 'b'; }],
]) test(`detects live ${name} when HTML is unchanged`, () => {
  const { form, snapshot } = fixture();
  const expected = snapshot();
  change(form);
  const results = compareSnapshots(snapshot(), expected);
  for (const category of ['html', 'dom']) assert.equal(results.find(result => result.category === category).passed, true);
  for (const category of ['controls', 'fields']) assert.equal(results.find(result => result.category === category).passed, false);
});

test('reports all CSS, data, focus and response differences after an HTML failure', () => {
  const expected = { html: '<input>', css: { display: 'block' }, data: { name: 'Saved' }, focus: { start: 1 }, response: { valid: true } };
  const actual = { html: '<textarea>', css: { display: 'none' }, data: { name: 'Edited' }, focus: { start: 0 }, response: { valid: false } };
  const results = compareSnapshots(actual, expected);
  assert.equal(results.length, 5);
  assert.ok(results.every(result => !result.passed && result.error));
});

test('rejects different value types with matching serialized text', () => {
  const results = compareSnapshots({ data: '{}' }, { data: {} });
  assert.equal(results[0].passed, false);
  assert.match(results[0].error, /expected type object, actual type string/);
});

test('rendered views compare their contents, not the containers a framework marks', () => {
  const { window } = new JSDOM('<div id="view"><div id="form-view"><p>form</p></div><div id="outline-view"></div></div>');
  const view = window.document.querySelector('#view');
  const expected = renderedViews(view);
  // Vue marks a container it mounted and leaves a container it hydrated unmarked.
  view.querySelector('#form-view').setAttribute('data-v-app', '');
  assert.deepEqual(renderedViews(view), expected);
  view.querySelector('#form-view').firstElementChild.textContent = 'changed';
  assert.notDeepEqual(renderedViews(view), expected);
});

test('rendered form snapshots preserve framework container markers outside the comparison', () => {
  const { window } = new JSDOM('<div id="view"><div id="form-view"><p>form</p></div><div id="outline-view"></div><div id="data-view"></div></div><form id="form"></form>');
  const view = window.document.querySelector('#view');
  const form = window.document.querySelector('#form');
  const expected = renderedFormSnapshot(view, form);
  view.querySelector('#form-view').setAttribute('data-v-app', '');
  assert.deepEqual(renderedFormSnapshot(view, form), expected);
  view.querySelector('#form-view').firstElementChild.textContent = 'changed';
  assert.notDeepEqual(renderedFormSnapshot(view, form), expected);
});

test('rendered views drop framework anchors and compare style as a declaration block', () => {
  const { window } = new JSDOM('<div id="view"><div id="form-view"><div style="color:red"><span>a</span></div></div></div>');
  const view = window.document.querySelector('#view');
  const server = renderedViews(view).dom;
  const row = view.querySelector('[style]');
  // A framework writes the block it computes and keeps anchors that render nothing.
  row.setAttribute('style', 'color: red;');
  row.append(window.document.createComment('anchor'), window.document.createTextNode(''));
  assert.deepEqual(renderedViews(view).dom, server);
  row.setAttribute('style', 'color: blue;');
  assert.notDeepEqual(renderedViews(view).dom, server);
});
