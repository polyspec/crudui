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

const nodeKinds = ['field', 'group', 'collection', 'row', 'lang', 'lang-item'];
const actionNames = ['move-up', 'move-down', 'add-row', 'copy-row', 'remove-row'];

function validateControls(controls) {
  assert.ok(object(controls), 'Controls must be an object');
  assert.ok(['header', 'footer', 'outline'].includes(controls.placement), 'Unknown controls placement');
  assert.equal(typeof controls.label, 'string', 'Controls label must be a string');
  assert.ok(Array.isArray(controls.actions), 'Control actions must be an array');
  for (const action of controls.actions) {
    assert.ok(actionNames.includes(action.name), 'Unknown control action');
    assert.equal(typeof action.label, 'string', 'Action label must be a string');
    assert.equal(typeof action.disabled, 'boolean', 'Action disabled must be a boolean');
  }
}

/** Validate nodes of the recursive form grammar (docs/spec/form-markup.md). */
function validateFields(nodes) {
  assert.ok(Array.isArray(nodes), 'Nodes must be an array');
  for (const node of nodes) {
    assert.ok(object(node), 'Node must be an object');
    assert.ok(nodeKinds.includes(node.kind), 'Unknown node kind');
    assert.equal(typeof node.className, 'string', 'Node className must be a string');
    assert.equal(typeof node.hidden, 'boolean', 'Node hidden must be a boolean');
    assert.ok(object(node.body) && typeof node.body.className === 'string', 'Node body must have a className');
    if (node.header !== undefined) {
      assert.ok(object(node.header) && typeof node.header.className === 'string', 'Node header must have a className');
    }
    if (node.controls !== undefined) validateControls(node.controls);
    if (['field', 'group', 'collection', 'lang'].includes(node.kind)) {
      assert.equal(typeof node.path, 'string', 'Node path must be a string');
    }
    if (node.kind === 'row') assert.equal(typeof node.key, 'string', 'Row key must be a string');
    if (node.kind === 'lang-item') assert.equal(typeof node.lang, 'string', 'Language code must be a string');
    if (['group', 'collection', 'lang'].includes(node.kind) || (node.kind === 'row' && node.collapsible === true)) {
      validateFields(node.children);
    }
    if (node.kind === 'field') assert.ok(object(node.checkbox) || object(node.widget), 'Field node must have a control');
    if (node.kind === 'lang-item' || (node.kind === 'row' && node.collapsible !== true)) {
      assert.ok(object(node.widget), 'Node must have a widget');
    }
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
    case 'bindButtons':
      assert.ok(Array.isArray(value), 'Buttons must be an array');
      for (const button of value) {
        assert.deepEqual(Object.keys(button), ['type', 'tag', 'text', 'attrs'], 'Button members differ');
        assert.ok(object(button.attrs) && Object.values(button.attrs).every(item => typeof item === 'string'), 'Button attributes must be strings');
      }
      break;
    case 'formButtonsHtml': assert.equal(typeof value, 'string', 'Button HTML must be a string'); break;
    case 'renderList': assert.equal(typeof value, 'string', 'List HTML must be a string'); break;
    case 'buildList': {
      assert.ok(object(value), 'List model must be an object');
      // A list without a sort declaration has no sort member.
      const members = ['columns', 'rows', 'pagination', ...(Object.hasOwn(value, 'sort') ? ['sort'] : []), 'actions', 'empty', 'design'];
      assert.deepEqual(Object.keys(value), members, 'List model members differ');
      assert.ok(Array.isArray(value.columns) && Array.isArray(value.rows) && Array.isArray(value.actions));
      break;
    }
    case 'buildDetail':
      assert.ok(object(value), 'Detail model must be an object');
      assert.deepEqual(Object.keys(value), ['fields', 'design'], 'Detail model members differ');
      assert.ok(Array.isArray(value.fields), 'Detail fields must be an array');
      for (const field of value.fields) {
        assert.deepEqual(Object.keys(field), ['key', 'label', 'format', 'value', 'display', 'design'], 'Detail field members differ');
      }
      break;
    case 'renderDetail': assert.equal(typeof value, 'string', 'Detail HTML must be a string'); break;
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

// Node and widget models have one member order in every runtime (docs/spec/form-runtime.md).
export function equalModels(actual, expected, path = '$') {
  assert.deepStrictEqual(actual, expected, `Different model at ${path}`);
  equalOrdered(actual, expected, path);
}

export function equalState(actual, expected) {
  equalOrdered(actual.data, expected.data, '$.data');
  equalModels(actual.fields, expected.fields, '$.fields');
  assert.equal(actual.html, expected.html, 'Raw form HTML differs');
  assert.equal(actual.revision, expected.revision, 'Revision differs');
}
