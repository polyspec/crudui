import { pathToFileURL } from 'node:url';
import { compileForm, bindForm, buildList, buildDetail, createForm, FormInputError } from '@crudui/generator-core';
import * as react from '@crudui/generator-react';
import * as html from '@crudui/generator-html';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
export function errorRecord(error) {
  return { code: typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR', message: String(error?.message ?? error), at: typeof error?.at === 'string' ? error.at : typeof error?.path === 'string' ? error.path : Array.isArray(error?.trace) ? error.trace.join('.') : '' };
}

/** Build the protocol dispatcher over one JavaScript string renderer's form, list and detail APIs. */
export function createDispatch({ renderForm, renderList, renderDetail }) {
  const state = form => ({ data: form.getData(), fields: form.getSnapshot().fields, html: renderForm(form), revision: form.getSnapshot().revision });
  return function dispatch(request) {
    if (!object(request)) throw new FormInputError('Request must be an object');
    if (own(request, 'options') && !object(request.options)) throw new FormInputError('Options must be an object');
    if (own(request, 'data') && !object(request.data)) throw new FormInputError('Form data must be an object');
    switch (request.operation) {
      case 'compileForm': return compileForm(request.spec, request.options);
      case 'bindForm': return bindForm(request.template, request.data, request.options);
      case 'renderList': return renderList(request.spec, request.rows, request.options);
      case 'buildList': return buildList(request.spec, request.rows, request.options);
      case 'buildDetail':
      case 'renderDetail':
        // The library checks the record in rule order; an absent record is the empty object.
        return (request.operation === 'buildDetail' ? buildDetail : renderDetail)(request.spec, own(request, 'record') ? request.record : {}, request.options);
      case 'form': {
        const form = createForm(request.template, request.data, request.options);
        if (own(request, 'actions') && !Array.isArray(request.actions)) throw new FormInputError('Actions must be an array');
        const methods = new Set(['setData', 'setValue', 'addRow', 'copyRow', 'removeRow', 'moveRow', 'rekeyRow', 'getValue', 'getData']);
        const steps = [];
        for (const action of request.actions ?? []) {
          let result = null, error = null;
          try {
            if (!object(action) || !methods.has(action.method) || !Array.isArray(action.args)) throw new FormInputError('Invalid form action');
            result = form[action.method](...action.args) ?? null;
          } catch (caught) { error = errorRecord(caught); }
          steps.push({ result, error, ...state(form) });
        }
        return { ...state(form), steps };
      }
      default: throw new FormInputError('Unknown generator operation');
    }
  };
}

// The string renderers' reference: React's server rendering. The HTML renderer must match it byte for byte.
export const dispatch = createDispatch(react);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const index = process.argv.indexOf('--renderer');
    const name = index === -1 ? 'react' : process.argv[index + 1];
    const renderers = { react, html };
    if (!Object.hasOwn(renderers, name)) throw new FormInputError('Unknown JavaScript renderer');
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    const request = JSON.parse(input);
    process.stdout.write(`${JSON.stringify(createDispatch(renderers[name])(request))}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ error: errorRecord(error) })}\n`);
    process.exitCode = 1;
  }
}
