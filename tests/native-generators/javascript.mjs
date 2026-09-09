import { pathToFileURL } from 'node:url';
import { compileForm, bindForm, createForm } from '@crudui/generator-core';
import { renderForm, renderList } from '@crudui/generator-react';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
export function errorRecord(error) {
  return { code: typeof error?.code === 'string' ? error.code : 'INVALID_FORM_INPUT', message: String(error?.message ?? error), at: typeof error?.at === 'string' ? error.at : typeof error?.path === 'string' ? error.path : Array.isArray(error?.trace) ? error.trace.join('.') : '' };
}
function state(form) {
  return { data: form.getData(), fields: form.getSnapshot().fields, html: renderForm(form), revision: form.getSnapshot().revision };
}
export function dispatch(request) {
  if (!object(request)) throw new TypeError('Request must be an object');
  if (own(request, 'options') && !object(request.options)) throw new TypeError('Options must be an object');
  if (own(request, 'data') && !object(request.data)) throw new TypeError('Form data must be an object');
  switch (request.operation) {
    case 'compileForm': return compileForm(request.spec, request.options);
    case 'bindForm': return bindForm(request.template, request.data, request.options);
    case 'renderList':
      if (own(request, 'rows') && (!Array.isArray(request.rows) || request.rows.some(row => !object(row)))) throw new TypeError('List rows must be objects in an array');
      return renderList(request.spec, request.rows, request.options);
    case 'form': {
      const form = createForm(request.template, request.data, request.options);
      if (own(request, 'actions') && !Array.isArray(request.actions)) throw new TypeError('Actions must be an array');
      const methods = new Set(['setData', 'setValue', 'addRow', 'copyRow', 'removeRow', 'moveRow', 'rekeyRow', 'getValue', 'getData']);
      const steps = [];
      for (const action of request.actions ?? []) {
        let result = null, error = null;
        try {
          if (!object(action) || !methods.has(action.method) || !Array.isArray(action.args)) throw new TypeError('Invalid form action');
          result = form[action.method](...action.args) ?? null;
        } catch (caught) { error = errorRecord(caught); }
        steps.push({ result, error, ...state(form) });
      }
      return { ...state(form), steps };
    }
    default: throw new TypeError('Unknown generator operation');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    const request = JSON.parse(input);
    process.stdout.write(`${JSON.stringify(dispatch(request))}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ error: errorRecord(error) })}\n`);
    process.exitCode = 1;
  }
}
