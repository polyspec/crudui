// The stage of the canonical page (docs/spec/form-comparison.md, "Canonical page"), built once per
// client with `#stage` resolved to that client's renderer. Under SSR it takes over the stage the
// selected server rendered, with the stage data of the document; under CSR it requests the JSON of
// the selected server and renders the view itself. The form submits its native fields to the
// selected server.
import { compileForm, createForm } from '@crudui/generator-core';

import * as client from '#stage';
import { bindFormController } from '../bind-form-controller.mjs';
import { readJson, saveForm } from '../save-form.mjs';
import { formData, linkedSpecs } from '../record-view.mjs';

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
  saveForm(stage, form, {
    selection, record, text,
    send: (target, fields) => fetch(target, { method: 'POST', body: fields, cache: 'no-store' }),
    navigate: address => { location.href = address; },
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
