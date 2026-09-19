import assert from 'node:assert/strict';
import test from 'node:test';

// The save handler of the canonical page (docs/spec/form-comparison.md, "Canonical page"):
// 200 navigates, 422 shows the validation result, every other answer shows an alert before the
// form and leaves the form submittable again.
const { JSDOM } = await import('jsdom');

const { saveForm } = await import('./save-form.mjs');

const text = { invalid: 'Validation failed.', saveFailed: 'Saving the record failed.' };
const selection = { lang: 'en', server: 'go', framework: 'html', initialization: 'ssr', mode: 'createForm', page: 2 };
const record = { id: '22' };

let window;
function page() {
  const dom = new JSDOM('<!doctype html><div id="stage"><form id="record-form" action="/api/go/records/22"><input name="score" value="9100"></form></div>');
  window = dom.window;
  globalThis.document = window.document;
  globalThis.FormData = window.FormData;
  const stage = window.document.getElementById('stage');
  const form = window.document.getElementById('record-form');
  return { stage, form };
}

function submit(form) {
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
}

test('a failed save request shows an alert before the form and keeps the form submittable', async () => {
  const { stage, form } = page();
  const requests = [];
  const send = async (target, fields) => {
    requests.push({ target, complete: fields.get('_form_complete') });
    return {
      status: 502,
      headers: new Map([['content-type', 'application/json; charset=utf-8']]),
      json: async () => ({ error: 'upstream stopped' }),
    };
  };
  let navigated;
  saveForm(stage, form, { selection, record, text, send, navigate: address => { navigated = address; } });

  submit(form);
  await new Promise(resolve => setTimeout(resolve, 0));

  const alert = stage.querySelector('#save-errors');
  assert.notEqual(alert, null, 'the save failure alert exists');
  assert.equal(alert.getAttribute('role'), 'alert');
  assert.match(alert.textContent, /Saving the record failed\./);
  assert.match(alert.textContent, /502/);
  assert.match(alert.textContent, /upstream stopped/);
  assert.equal(navigated, undefined, 'the page does not navigate');
  assert.equal(form.isConnected, true, 'the form stays in the document');
  assert.deepEqual(requests, [{ target: '/api/go/records/22', complete: '1' }]);

  submit(form);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(requests.length, 2, 'the form accepts a second submit');
});

test('a non-JSON answer shows the same alert', async () => {
  const { stage, form } = page();
  const send = async () => ({
    status: 200,
    headers: new Map([['content-type', 'text/html']]),
    json: async () => ({}),
  });
  saveForm(stage, form, { selection, record, text, send, navigate: () => {} });

  submit(form);
  await new Promise(resolve => setTimeout(resolve, 0));

  const alert = stage.querySelector('#save-errors');
  assert.notEqual(alert, null, 'the save failure alert exists');
  assert.match(alert.textContent, /text\/html/);
});

test('a rejected request shows the same alert', async () => {
  const { stage, form } = page();
  const send = async () => {
    throw new Error('network down');
  };
  saveForm(stage, form, { selection, record, text, send, navigate: () => {} });

  submit(form);
  await new Promise(resolve => setTimeout(resolve, 0));

  const alert = stage.querySelector('#save-errors');
  assert.notEqual(alert, null, 'the save failure alert exists');
  assert.match(alert.textContent, /network down/);
});

test('a 422 answer shows the validation result and no save alert', async () => {
  const { stage, form } = page();
  const send = async () => ({
    status: 422,
    headers: new Map([['content-type', 'application/json; charset=utf-8']]),
    json: async () => ({ validation: { valid: false, errors: [{ path: 'score', message: 'not a number' }] } }),
  });
  let navigated;
  saveForm(stage, form, { selection, record, text, send, navigate: address => { navigated = address; } });

  submit(form);
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(stage.querySelector('#record-errors')?.textContent, 'Validation failed.score: not a number');
  assert.equal(stage.querySelector('#save-errors'), null);
  assert.equal(navigated, undefined);
});

test('a 200 answer navigates to the saved list address', async () => {
  const { stage, form } = page();
  const send = async () => ({
    status: 200,
    headers: new Map([['content-type', 'application/json; charset=utf-8']]),
    json: async () => ({ record, validation: { valid: true, errors: [] } }),
  });
  let navigated;
  saveForm(stage, form, { selection, record, text, send, navigate: address => { navigated = address; } });

  submit(form);
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(navigated, '/?lang=en&server=go&framework=html&initialization=ssr&mode=createForm&page=2&saved=22');
  assert.equal(stage.querySelector('#save-errors'), null);
});

test('a second submit while a save runs is ignored', async () => {
  const { stage, form } = page();
  let release;
  const send = () => new Promise(resolve => { release = resolve; });
  saveForm(stage, form, { selection, record, text, send, navigate: () => {} });

  submit(form);
  submit(form);
  release({ status: 200, headers: new Map([['content-type', 'application/json']]), json: async () => ({}) });
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(stage.querySelector('#save-errors'), null);
});
