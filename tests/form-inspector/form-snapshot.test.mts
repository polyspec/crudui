import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM, type DOMWindow } from 'jsdom';
import { compareSnapshots, formSnapshot, renderedFormSnapshot, renderedViews } from './form-snapshot.mts';

/** A value the fixture's markup guarantees. */
function present<T>(value: T | null | undefined): T {
  assert.ok(value !== null && value !== undefined);
  return value;
}

/** A node the fixture's markup guarantees to be of a kind of its window. */
function is<T>(value: unknown, kind: abstract new (...args: never[]) => T): T {
  assert.ok(value instanceof kind, `expected a ${kind.name}`);
  return value;
}

/** A change to the fixture's form, with the window whose kinds of node it uses. */
type Change = [name: string, change: (form: HTMLFormElement, window: DOMWindow) => unknown];

function fixture() {
  const { window } = new JSDOM('<form><div class="row" data-key="__0000000000005__"><label>Name</label><input name="form[name]" value="Saved"><input name="form[enabled]" type="checkbox" checked><textarea name="form[notes]">Notes</textarea><select name="form[category]"><option value="a" selected>A</option><option value="b">B</option></select></div><div class="row" data-key="__0000000000001__">Second<!-- kept --></div></form>');
  const form = present(window.document.querySelector('form'));
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
  const row = present(form.firstElementChild);
  row.removeAttribute('class');
  row.setAttribute('class', 'row');
  const actual = snapshot();
  const results = compareSnapshots(actual, expected);
  assert.equal(present(results.find(result => result.category === 'html')).passed, false);
  assert.equal(present(results.find(result => result.category === 'dom')).passed, true);
  assert.ok(form.isEqualNode(expectedNode));
});

for (const [name, change] of [
  ['missing attribute', form => present(form.firstElementChild).removeAttribute('data-key')],
  ['changed row key', form => present(form.firstElementChild).setAttribute('data-key', '__0000000000007__')],
  ['class value', form => present(form.firstElementChild).classList.add('changed')],
  ['hidden attribute', (form, window) => { is(form.firstElementChild, window.HTMLElement).hidden = true; }],
  ['empty style attribute', form => present(form.firstElementChild).setAttribute('style', '')],
  ['inline style', (form, window) => { is(form.firstElementChild, window.HTMLElement).style.display = 'none'; }],
  ['text', form => { present(form.querySelector('label')).textContent = 'Changed'; }],
  ['comment', (form, window) => { is(form.lastElementChild?.lastChild, window.Comment).data = 'changed'; }],
  ['child order', form => form.prepend(present(form.lastElementChild))],
  ['missing child', form => present(form.lastElementChild).remove()],
] satisfies Change[]) test(`detects ${name}`, () => {
  const { window, form, snapshot } = fixture();
  const expected = snapshot();
  change(form, window);
  const results = compareSnapshots(snapshot(), expected);
  assert.equal(present(results.find(result => result.category === 'dom')).passed, false);
  assert.equal(present(results.find(result => result.category === 'html')).passed, false);
});

for (const [name, change] of [
  ['input value', form => { present(form.querySelector('input')).value = 'Edited'; }],
  ['checked property', (form, window) => { is(form.querySelector('[type=checkbox]'), window.HTMLInputElement).checked = false; }],
  ['textarea value', form => { present(form.querySelector('textarea')).value = 'Edited'; }],
  ['selected option', form => { present(form.querySelector('select')).value = 'b'; }],
] satisfies Change[]) test(`detects live ${name} when HTML is unchanged`, () => {
  const { window, form, snapshot } = fixture();
  const expected = snapshot();
  change(form, window);
  const results = compareSnapshots(snapshot(), expected);
  for (const category of ['html', 'dom']) assert.equal(present(results.find(result => result.category === category)).passed, true);
  for (const category of ['controls', 'fields']) assert.equal(present(results.find(result => result.category === category)).passed, false);
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
  const result = present(results[0]);
  assert.ok(!result.passed, 'different value types fail');
  assert.match(result.error, /expected type object, actual type string/);
});

test('rendered views compare their contents, not the containers a framework marks', () => {
  const { window } = new JSDOM('<div id="view"><div id="form-view"><p>form</p></div><div id="outline-view"></div></div>');
  const view = is(window.document.querySelector('#view'), window.HTMLElement);
  const expected = renderedViews(view);
  // Vue marks a container it mounted and leaves a container it hydrated unmarked.
  present(view.querySelector('#form-view')).setAttribute('data-v-app', '');
  assert.deepEqual(renderedViews(view), expected);
  present(present(view.querySelector('#form-view')).firstElementChild).textContent = 'changed';
  assert.notDeepEqual(renderedViews(view), expected);
});

test('rendered form snapshots preserve framework container markers outside the comparison', () => {
  const { window } = new JSDOM('<div id="view"><div id="form-view"><p>form</p></div><div id="outline-view"></div><div id="data-view"></div></div><form id="form"></form>');
  const view = is(window.document.querySelector('#view'), window.HTMLElement);
  const form = is(window.document.querySelector('#form'), window.HTMLFormElement);
  const expected = renderedFormSnapshot(view, form);
  present(view.querySelector('#form-view')).setAttribute('data-v-app', '');
  assert.deepEqual(renderedFormSnapshot(view, form), expected);
  present(present(view.querySelector('#form-view')).firstElementChild).textContent = 'changed';
  assert.notDeepEqual(renderedFormSnapshot(view, form), expected);
});

test('rendered views drop framework anchors and compare style as a declaration block', () => {
  const { window } = new JSDOM('<div id="view"><div id="form-view"><div style="color:red"><span>a</span></div></div></div>');
  const view = is(window.document.querySelector('#view'), window.HTMLElement);
  const server = renderedViews(view).dom;
  const row = present(view.querySelector('[style]'));
  // A framework writes the block it computes and keeps anchors that render nothing.
  row.setAttribute('style', 'color: red;');
  row.append(window.document.createComment('anchor'), window.document.createTextNode(''));
  assert.deepEqual(renderedViews(view).dom, server);
  row.setAttribute('style', 'color: blue;');
  assert.notDeepEqual(renderedViews(view).dom, server);
});
