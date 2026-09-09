import assert from 'node:assert/strict';

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export class OperationError extends Error {
  constructor(error) {
    super(error.message);
    this.name = 'OperationError';
    this.code = error.code;
    this.at = error.at;
  }
}

export function validateError(error) {
  assert.ok(object(error), 'Error must be an object');
  for (const key of ['code', 'message', 'at']) {
    assert.equal(typeof error[key], 'string', `Error ${key} must be a string`);
  }
  assert.notEqual(error.code, '', 'Error code must not be empty');
}

function validateFields(fields) {
  assert.ok(Array.isArray(fields), 'Fields must be an array');
  for (const field of fields) {
    assert.ok(object(field), 'Field must be an object');
    for (const key of ['shape', 'type', 'path', 'wrapperName', 'uniqid']) {
      assert.equal(typeof field[key], 'string', `Field ${key} must be a string`);
    }
    assert.ok(['leaf', 'group', 'multiple-leaf', 'multiple-group', 'lang'].includes(field.shape), 'Unknown field shape');
    assert.equal(typeof field.omitLabel, 'boolean', 'omitLabel must be a boolean');
    assert.ok(object(field.design), 'Field design must be an object');
    assert.equal(typeof field.design.show, 'boolean', 'Design show must be a boolean');
    for (const node of ['main', 'label', 'wrapper', 'group', 'prepend']) {
      assert.ok(object(field.design[node]), `Missing design node ${node}`);
      assert.equal(typeof field.design[node].class, 'string');
      assert.equal(typeof field.design[node].style, 'string');
    }
    if (field.shape === 'group') validateFields(field.children);
    if (field.shape.startsWith('multiple-')) {
      assert.ok(Array.isArray(field.rows), 'Repeated rows must be an array');
      for (const row of field.rows) {
        assert.ok(object(row));
        assert.equal(typeof row.uniqid, 'string');
        if (field.shape === 'multiple-group') validateFields(row.children);
        else assert.ok(object(row.widget), 'Repeated leaf must have a widget');
      }
    }
    if (field.shape === 'lang') assert.ok(Array.isArray(field.lang?.children), 'Language children must be an array');
    if (field.shape === 'leaf') assert.ok(field.checkbox === true || object(field.widget), 'Leaf must have a control');
  }
}

function validateState(value) {
  assert.ok(object(value), 'Form state must be an object');
  assert.ok(object(value.data), 'Form data must be an object');
  validateFields(value.fields);
  assert.equal(typeof value.html, 'string', 'Form HTML must be a string');
  assert.ok(Number.isSafeInteger(value.revision) && value.revision >= 0, 'Revision must be a nonnegative integer');
}

export function validateResponse(request, value) {
  switch (request.operation) {
    case 'compileForm': {
      assert.ok(object(value), 'Template must be an object');
      assert.equal(value.kind, 'crudui/form-template');
      const check = fields => {
        assert.ok(Array.isArray(fields), 'Template fields must be an array');
        for (const field of fields) {
          assert.ok(object(field));
          assert.equal(typeof field.name, 'string');
          assert.ok(object(field.spec), 'Field specification must be an object');
          check(field.children);
        }
      };
      check(value.fields);
      break;
    }
    case 'bindForm': validateFields(value); break;
    case 'renderList': assert.equal(typeof value, 'string', 'List HTML must be a string'); break;
    case 'form':
      validateState(value);
      assert.ok(Array.isArray(value.steps), 'Form steps must be an array');
      assert.equal(value.steps.length, request.actions?.length ?? 0, 'Every requested action must produce one step');
      for (const step of value.steps) {
        assert.ok(own(step, 'result') && own(step, 'error'), 'Step must contain result and error');
        if (step.error !== null) validateError(step.error);
        validateState(step);
      }
      break;
    default: throw new Error(`Unknown operation ${request.operation}`);
  }
  return value;
}

export function parseCLIResponse(request, processResult) {
  const { status, signal, stdout, error } = processResult;
  if (error) throw new Error(`CLI execution failed: ${error.message}`);
  if (signal || status === null || status === undefined) throw new Error(`CLI terminated: ${signal ?? 'missing exit status'}`);
  let value;
  try { value = JSON.parse(stdout); } catch { throw new Error('CLI did not return one JSON value'); }
  if (object(value) && own(value, 'error')) {
    validateError(value.error);
    assert.equal(status, 1, 'Operation errors must exit with status 1');
    throw new OperationError(value.error);
  }
  assert.equal(status, 0, 'A failed CLI cannot return a successful result');
  return validateResponse(request, value);
}

export function equalOrdered(actual, expected, path = '$') {
  assert.deepStrictEqual(actual, expected, `Different value at ${path}`);
  if (Array.isArray(actual)) {
    actual.forEach((value, index) => equalOrdered(value, expected[index], `${path}[${index}]`));
  } else if (object(actual)) {
    assert.deepStrictEqual(Object.keys(actual), Object.keys(expected), `Different object member order at ${path}`);
    for (const key of Object.keys(actual)) equalOrdered(actual[key], expected[key], `${path}.${key}`);
  }
}

export function equalModels(actual, expected, path = '$') {
  assert.deepStrictEqual(actual, expected, `Different model at ${path}`);
  const visit = (a, e, name) => {
    if (Array.isArray(a)) return a.forEach((value, index) => visit(value, e[index], `${name}[${index}]`));
    if (!object(a)) return;
    for (const key of Object.keys(a)) {
      if (key === 'attrs' || (name.endsWith('.extra') && object(a[key]))) equalOrdered(a[key], e[key], `${name}.${key}`);
      else visit(a[key], e[key], `${name}.${key}`);
    }
  };
  visit(actual, expected, path);
}

export function equalState(actual, expected) {
  equalOrdered(actual.data, expected.data, '$.data');
  equalModels(actual.fields, expected.fields, '$.fields');
  assert.equal(actual.html, expected.html, 'Raw form HTML differs');
  assert.equal(actual.revision, expected.revision, 'Revision differs');
}
