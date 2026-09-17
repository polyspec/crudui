// The stage of the canonical page (docs/spec/form-comparison.md, "Canonical page"), built once per
// client with `#stage` resolved to that client's renderer. Under SSR it takes over the stage the
// selected server rendered, with the stage data of the document; under CSR it requests the JSON of
// the selected server and renders the view itself. The form submits its native fields to the
// selected server.
import { compileForm, createForm } from '@crudui/generator-core';

import * as client from '#stage';
import { bindFormController } from '../bind-form-controller.mjs';
import { formData, linkedSpecs, selectionQuery } from '../record-view.mjs';

/** The JSON body of a response with one of the expected statuses; any other response fails. */
async function readJson(response, what, statuses = [200]) {
  const type = response.headers.get('content-type') ?? '';
  if (!type.startsWith('application/json')) throw new Error(`${what}: ${response.status} ${type}`);
  const body = await response.json();
  if (!statuses.includes(response.status)) throw new Error(`${what}: ${response.status} ${body.error}`);
  return body;
}

/** The data of the view: the document's stage data under SSR, the selected server's JSON under CSR. */
async function viewData(view, selection, id, hydrate) {
  if (hydrate) {
    const element = document.querySelector('script#crudui-stage-data');
    if (!element) throw new Error('The SSR document has no stage data');
    return JSON.parse(element.textContent);
  }
  const target = view === 'list'
    ? `/api/${selection.server}/records?page=${selection.page}`
    : `/api/${selection.server}/records/${encodeURIComponent(id)}`;
  return readJson(await fetch(target, { cache: 'no-store' }), `GET ${target}`);
}

/** Mark the fields the validation result names and list its errors before the form. */
function showValidation(stage, form, validation, text) {
  stage.querySelector('#record-errors')?.remove();
  for (const input of form.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
  for (const message of form.querySelectorAll('[data-validation-error]')) message.remove();
  if (validation.valid) return;
  const summary = document.createElement('div');
  summary.id = 'record-errors';
  summary.className = 'record-errors';
  summary.setAttribute('role', 'alert');
  const title = document.createElement('p');
  title.textContent = text.invalid;
  summary.append(title);
  const controls = [...form.querySelectorAll('input[name],textarea[name],select[name]')];
  for (const error of validation.errors) {
    const name = `form${error.path.split('.').map(part => `[${part}]`).join('')}`;
    const item = document.createElement('p');
    item.textContent = `${error.path}: ${error.message}`;
    summary.append(item);
    const control = controls.find(input => input.name === name);
    if (!control) continue;
    control.setAttribute('aria-invalid', 'true');
    const message = document.createElement('p');
    message.dataset.validationError = '';
    message.className = 'record-error';
    message.textContent = error.message;
    control.closest('[data-field-path]')?.append(message);
  }
  form.before(summary);
}

function formElement(stage, selection, id, hydrate) {
  if (hydrate) {
    const form = stage.querySelector('form#record-form');
    if (!form) throw new Error('The SSR form document has no record form');
    return form;
  }
  const form = document.createElement('form');
  form.id = 'record-form';
  form.method = 'post';
  form.action = `/api/${selection.server}/records/${encodeURIComponent(id)}`;
  form.enctype = 'multipart/form-data';
  stage.replaceChildren(form);
  return form;
}

async function startForm(stage, specs, record, selection, text, hydrate) {
  const language = selection.lang;
  const template = compileForm(specs.form, { keyPrefix: 'form' });
  const form = formElement(stage, selection, record.id, hydrate);
  const data = formData(record);
  if (selection.mode === 'bindForm') {
    const controller = bindFormController(form,
      next => client.bindFormView(form, template, language, next, hydrate), template, language, data);
    await controller.idle();
  } else {
    const view = client.sessionFormView(form, createForm(template, data, { language }), hydrate);
    await view.rendered;
  }
  let saving = false;
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (saving) return;
    saving = true;
    const fields = new FormData(form, event.submitter ?? null);
    if (!fields.has('_form_complete')) fields.append('_form_complete', '1');
    const target = form.getAttribute('action');
    fetch(target, { method: 'POST', body: fields, cache: 'no-store' }).then(async response => {
      const body = await readJson(response, `POST ${target}`, [200, 422]);
      if (response.status === 422) {
        showValidation(stage, form, body.validation, text);
        return;
      }
      location.href = `/?${selectionQuery(selection)}&saved=${encodeURIComponent(record.id)}`;
    }).finally(() => { saving = false; });
  });
}

/**
 * Render or take over the view in `stage` and resolve once it is interactive. A view that cannot
 * initialize rejects, which the page reports as a script error.
 */
export async function startStage({ stage, view, selection, id, text }) {
  const hydrate = selection.initialization === 'ssr';
  const [specs, data] = await Promise.all([
    fetch('/customer-specs.json', { cache: 'no-store' }).then(response => readJson(response, 'GET /customer-specs.json')),
    viewData(view, selection, id, hydrate),
  ]);
  const linked = linkedSpecs(specs, selection);
  const language = selection.lang;
  if (view === 'list') {
    await client.list(stage, linked.list, data.records,
      { language, layout: 'table', page: data.page, total: data.total }, hydrate);
  } else if (view === 'detail') {
    await client.detail(stage, linked.detail, data.record, { language }, hydrate);
  } else {
    await startForm(stage, linked, data.record, selection, text, hydrate);
  }
}
