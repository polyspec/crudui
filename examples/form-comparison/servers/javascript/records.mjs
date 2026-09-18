// The JavaScript record server (docs/spec/form-comparison.md, "Record resource"): one persistent
// store of the customer records, its HTTP contract and the SSR stage views, rendered with the
// JavaScript generators and checked with the JavaScript validator. The public server answers
// `/api/js/records…` with this module and `servers/javascript/main.mjs` serves it on its own.
import { randomBytes } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { compileForm, createForm } from '@crudui/generator-core';
import { renderDetail, renderForm, renderList } from '@crudui/generator-html';
import { FormInputError, validate } from '@crudui/validator';

import {
  formData, linkedSpecs, recordClients, recordLanguages, recordModes, recordsPerPage, recordViews,
} from '../../src/record-view.mjs';

const bodyLimit = 2 * 1024 * 1024;
const positiveInteger = /^[1-9][0-9]*$/;
// The submitted form (docs/spec/form-comparison.md, "Record resource"): `text` and `checkbox`
// leaves, `texts`, an object of exactly these text members, `fields`, an object of these fields,
// and `rows`, keyed rows of one object of fields.
const text = 'text';
const checkbox = 'checkbox';
const texts = (...members) => ({ texts: members });
const fields = members => ({ fields: members });
const rows = members => ({ rows: fields(members) });
const required = shape => ({ required: shape });
const rowKey = /^__[0-9a-f]{13}__$/;
const formShape = fields({
  id: required(text), name: text, status: text, joined: text, score: text, relation: texts('name'), markup: text,
  companies: rows({
    name: text,
    stores: rows({
      name: text, enabled: checkbox, detail: text, title: texts('ko', 'en'),
      departments: rows({ name: text }),
    }),
  }),
});

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** The value of an absent field: empty text, empty texts or no rows. */
function empty(shape) {
  if (shape === text || shape === checkbox) return '';
  if (shape.texts) return Object.fromEntries(shape.texts.map(member => [member, '']));
  return {};
}

/**
 * The submitted `value` of `shape` at `path`, completed and in the member order of the shape.
 * Form data leaves out a field that holds no value, so an absent field other than a required one
 * completes as its empty value in both media types. Any other difference answers 400.
 */
function shaped(value, shape, path) {
  if (shape === text || shape === checkbox) {
    if (typeof value !== 'string') throw new HttpError(400, `Expected text at ${path}`);
    if (shape === checkbox && value !== '' && value !== '1') throw new HttpError(400, `Expected "" or "1" at ${path}`);
    return value;
  }
  if (!isObject(value)) throw new HttpError(400, `Expected an object at ${path}`);
  const result = {};
  if (shape.rows) {
    for (const [key, row] of Object.entries(value)) {
      if (!rowKey.test(key)) throw new HttpError(400, `Expected a row key at ${path}: ${key}`);
      result[key] = shaped(row, shape.rows, `${path}.${key}`);
    }
    return result;
  }
  const names = shape.texts ?? Object.keys(shape.fields);
  const extra = Object.keys(value).find(member => !names.includes(member));
  if (extra !== undefined) throw new HttpError(400, `Unexpected member ${path}.${extra}`);
  for (const member of names) {
    // An object of texts holds every member; a field may be absent unless it is required.
    const child = shape.texts ? required(text) : shape.fields[member];
    const field = child.required ?? child;
    if (Object.hasOwn(value, member)) result[member] = shaped(value[member], field, `${path}.${member}`);
    else if (child.required) throw new HttpError(400, `Missing member ${path}.${member}`);
    else result[member] = empty(field);
  }
  return result;
}

// The members of a stored record, in order (docs/spec/form-comparison.md, "Record resource", "Store").
const recordMembers = ['id', 'name', 'status', 'joined', 'score', 'relation', 'avatar', 'markup', 'companies'];

/**
 * Require the records array of a store or of the fixture: records with exactly the fixture's
 * members in order, `score` a number, every other scalar a string and `companies` complete in the
 * form's shape and member order. Anything else is a server fault.
 */
function checkRecords(value, name) {
  const malformed = (detail, cause) => new Error(`The record ${name} is malformed: ${detail}`, { cause });
  if (!Array.isArray(value)) throw malformed('expected a records array');
  for (const record of value) {
    if (!isObject(record) || Object.keys(record).join() !== recordMembers.join()) throw malformed('expected the record members');
    for (const member of recordMembers) {
      const item = record[member];
      const valid = member === 'score' ? typeof item === 'number'
        : member === 'relation' ? isObject(item) && Object.keys(item).join() === 'name' && typeof item.name === 'string'
          : member === 'companies' ? true : typeof item === 'string';
      if (!valid) throw malformed(`expected the record member ${member}`);
    }
    let companies;
    try {
      companies = shaped(record.companies, formShape.fields.companies, 'companies');
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      throw malformed(error.message, error);
    }
    // A stored record holds its companies complete, in member order.
    if (JSON.stringify(companies) !== JSON.stringify(record.companies)) throw malformed('expected complete companies in member order');
  }
  return value;
}

/** The submitted object of native fields `form[…]…` with `_form_complete=1`. */
function nativeForm(fields) {
  // Objects without a prototype keep every field name, `__proto__` included, an own member.
  const form = Object.create(null);
  let complete = 0;
  for (const [name, value] of fields) {
    if (typeof value !== 'string') throw new HttpError(400, `Field ${name} must be text`);
    if (name === '_form_complete') {
      if (value !== '1' || ++complete > 1) throw new HttpError(400, 'Expected one _form_complete=1');
      continue;
    }
    const match = /^form((?:\[[^[\]]+\])+)$/.exec(name);
    if (!match) throw new HttpError(400, `Unknown field ${name}`);
    const segments = match[1].slice(1, -1).split('][');
    const last = segments.pop();
    let parent = form;
    for (const segment of segments) {
      if (!Object.hasOwn(parent, segment)) parent[segment] = Object.create(null);
      else if (typeof parent[segment] !== 'object') throw new HttpError(400, `Repeated field ${name}`);
      parent = parent[segment];
    }
    if (Object.hasOwn(parent, last)) throw new HttpError(400, `Repeated field ${name}`);
    parent[last] = value;
  }
  if (complete !== 1) throw new HttpError(400, 'The form submission is incomplete');
  return form;
}

/**
 * Read one request body up to 2 MiB. A body over the limit fails with 413 as soon as it passes the
 * limit: the rest is never read, and the response closes the connection.
 */
function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const settle = (action, value) => {
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('error', onError);
      request.pause();
      action(value);
    };
    const onData = chunk => {
      size += chunk.length;
      if (size > bodyLimit) settle(reject, new HttpError(413, 'Request exceeds 2 MiB'));
      else chunks.push(chunk);
    };
    const onEnd = () => settle(resolve, Buffer.concat(chunks));
    const onError = error => settle(reject, error);
    request.on('data', onData);
    request.once('end', onEnd);
    request.once('error', onError);
  });
}

/** Parse one save request as the rendered form or as JSON posts it. */
async function parseSubmission(request, body) {
  const type = (request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (type === 'application/json') {
    let value;
    try {
      value = JSON.parse(body.toString('utf8'));
    } catch {
      throw new HttpError(400, 'Malformed JSON');
    }
    if (!isObject(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, 'form')) {
      throw new HttpError(400, 'Expected { "form": { … } }');
    }
    return shaped(value.form, formShape, 'form');
  }
  if (type !== 'multipart/form-data' && type !== 'application/x-www-form-urlencoded') {
    throw new HttpError(415, 'Expected multipart/form-data, application/x-www-form-urlencoded or application/json');
  }
  let fields;
  try {
    fields = await new Request('http://localhost/', {
      method: 'POST', headers: { 'Content-Type': request.headers['content-type'] }, body,
    }).formData();
  } catch {
    throw new HttpError(400, 'Malformed form request');
  }
  return shaped(nativeForm(fields), formShape, 'form');
}

/** Parse a view query: `id` first for detail and form, then the selection, each exactly once. */
function viewSelection(view, search, server) {
  const entries = [...new URLSearchParams(search)];
  const expected = [...(view === 'list' ? [] : ['id']), 'lang', 'server', 'framework', 'initialization', 'mode', 'page'];
  if (entries.length !== expected.length || entries.some(([key], index) => key !== expected[index])) {
    throw new HttpError(400, `Expected the query ${expected.join(', ')}`);
  }
  const query = Object.fromEntries(entries);
  if (!recordLanguages.includes(query.lang) || query.server !== server || !recordClients.includes(query.framework)
      || query.initialization !== 'ssr' || !recordModes.includes(query.mode) || !positiveInteger.test(query.page)
      || (view !== 'list' && !positiveInteger.test(query.id))) {
    throw new HttpError(400, 'Invalid view query');
  }
  return { id: query.id, selection: { ...query, id: undefined, page: Number(query.page) } };
}

/**
 * The record store of one server in `dataDirectory`, reading the published fixture and
 * specifications from `publicDirectory`. Writes run one at a time and replace the file atomically.
 */
export function recordStore({ server = 'js', dataDirectory, publicDirectory }) {
  const storeFile = path.join(dataDirectory, `records-${server}.json`);
  const readPublished = async name => JSON.parse(await readFile(path.join(publicDirectory, name), 'utf8'));
  const readFixture = async () => checkRecords(await readPublished('customer-records.json'), 'fixture');
  let queue = Promise.resolve();

  /** Run `task` after every earlier store operation of this process. */
  function exclusive(task) {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  }

  async function write(records) {
    const temporary = path.join(dataDirectory, `.records-${server}-${randomBytes(6).toString('hex')}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(records, null, 2) + '\n');
      await rename(temporary, storeFile);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async function read() {
    let text;
    try {
      text = await readFile(storeFile, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const records = await readFixture();
      await write(records);
      return records;
    }
    let records;
    try {
      records = JSON.parse(text);
    } catch (error) {
      throw new Error(`The record store is malformed: ${error.message}`, { cause: error });
    }
    return checkRecords(records, 'store');
  }

  const records = () => exclusive(read);
  const lastPage = total => Math.max(1, Math.ceil(total / recordsPerPage));
  const pageData = (stored, page) => {
    if (page > lastPage(stored.length)) throw new HttpError(404, 'Page not found');
    return {
      page, perPage: recordsPerPage, total: stored.length,
      records: stored.slice((page - 1) * recordsPerPage, page * recordsPerPage),
    };
  };
  const findRecord = (stored, id) => {
    const record = stored.find(item => item.id === id);
    if (!record) throw new HttpError(404, 'Record not found');
    return record;
  };

  /** One page of records, or a 404 failure beyond the last page. */
  async function list(page) {
    return pageData(await records(), page);
  }

  /** One stored record, or a 404 failure. */
  async function record(id) {
    return { record: findRecord(await records(), id) };
  }

  /** The SSR stage of one view for a view query string. */
  async function view(name, search) {
    if (!recordViews.includes(name)) throw new HttpError(404, 'Unknown view');
    const { id, selection } = viewSelection(name, search, server);
    const [stored, published] = await Promise.all([records(), readPublished('customer-specs.json')]);
    const specs = linkedSpecs(published, selection);
    const language = selection.lang;
    if (name === 'list') {
      const data = pageData(stored, selection.page);
      const html = renderList(specs.list, data.records, { language, layout: 'table', page: data.page, total: data.total });
      return { view: name, html, data };
    }
    const item = findRecord(stored, id);
    if (name === 'detail') {
      return { view: name, html: renderDetail(specs.detail, item, { language }), data: { record: item } };
    }
    const template = compileForm(specs.form, { keyPrefix: 'form' });
    const form = renderForm(createForm(template, formData(item), { language }));
    const html = `<form id="record-form" method="post" action="/api/${server}/records/${item.id}" `
      + `enctype="multipart/form-data">${form}</form>`;
    return { view: name, html, data: { record: item } };
  }

  async function save(id, request) {
    const body = await readBody(request);
    const specs = await readPublished('customer-specs.json');
    return exclusive(async () => {
      const stored = await read();
      const index = stored.findIndex(item => item.id === id);
      if (index < 0) throw new HttpError(404, 'Record not found');
      const form = await parseSubmission(request, body);
      if (form.id !== id) throw new HttpError(400, 'The submitted id differs from the record id');
      let validation;
      try {
        validation = validate(specs.form, form);
      } catch (error) {
        if (error instanceof FormInputError) throw new HttpError(400, error.message);
        throw error;
      }
      if (!validation.valid) return { status: 422, body: { validation } };
      const previous = stored[index];
      const saved = {};
      for (const [member, value] of Object.entries(previous)) {
        saved[member] = member === 'id' || member === 'avatar' ? value
          : member === 'score' ? Number(form.score)
            : member === 'relation' ? { name: form.relation.name } : form[member];
      }
      stored[index] = saved;
      await write(stored);
      return { status: 200, body: { record: saved, validation: { valid: true, errors: [] } } };
    });
  }

  async function reset(request) {
    const body = await readBody(request);
    if (body.length > 0) throw new HttpError(400, 'A reset takes no request body');
    const fixture = await readFixture();
    await exclusive(() => write(fixture));
    return { total: fixture.length };
  }

  /** Route one request on the server's own paths (`/api/records…`). */
  async function route(method, pathname, search, request) {
    const allow = allowed => {
      if (!allowed.includes(method)) throw new HttpError(405, 'Method not allowed');
    };
    if (pathname === '/api/records') {
      allow(['GET']);
      const entries = [...new URLSearchParams(search)];
      if (entries.length !== 1 || entries[0][0] !== 'page' || !positiveInteger.test(entries[0][1])) {
        throw new HttpError(400, 'Expected one page parameter');
      }
      return { status: 200, body: await list(Number(entries[0][1])) };
    }
    if (pathname === '/api/records/reset') {
      allow(['POST']);
      return { status: 200, body: await reset(request) };
    }
    const viewMatch = /^\/api\/records\/view\/([^/]+)$/.exec(pathname);
    if (viewMatch) {
      allow(['GET']);
      return { status: 200, body: await view(viewMatch[1], search) };
    }
    const idMatch = /^\/api\/records\/([^/]+)$/.exec(pathname);
    if (idMatch) {
      allow(['GET', 'POST']);
      if (method === 'POST') return save(idMatch[1], request);
      return { status: 200, body: await record(idMatch[1]) };
    }
    throw new HttpError(404, 'Unknown endpoint');
  }

  /**
   * Answer one request whose path is already relative to the server (`/api/records…`). Every
   * response is JSON that names this server.
   */
  async function handle(request, response, pathname, search) {
    let result;
    try {
      result = await route(request.method, pathname, search, request);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      result = { status, body: { error: error.message } };
    }
    // A body that was not read to its end is not read further: the connection closes.
    const connection = request.complete ? {} : { Connection: 'close' };
    response.writeHead(result.status, {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...connection,
    });
    response.end(JSON.stringify({ ...result.body, server }));
  }

  /**
   * Call one read of the store in process, with the status the HTTP contract gives it:
   * `list(page)`, `record(id)` or `view(name, search)`.
   */
  async function call(action, ...args) {
    try {
      return { status: 200, json: { ...await ({ list, record, view })[action](...args), server } };
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      return { status: error.status, json: { error: error.message, server } };
    }
  }

  return { handle, call };
}
