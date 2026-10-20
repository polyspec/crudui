import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { describe, expect, it } from 'vitest';
import { FormInputError } from '@polyspec/crudui-validator';
import { bindButtons, bindForm, compileForm, createForm } from './index';
import { isRecord } from './util';

/** A case of tests/fixtures/template-shape: the operation takes the template, the data and the options of the case. */
interface ShapeCase { name: string; operation: string; template: unknown; data: unknown; options: unknown; expect: unknown }

/** Calls a function with the case values, which the shape check at run time takes as they are. */
function call(fn: (...args: never[]) => unknown, args: unknown[]): unknown {
  const value: unknown = Reflect.apply(fn, undefined, args);
  return value;
}
const OPERATIONS: Record<string, (template: unknown, data: unknown, options: unknown) => unknown> = {
  bindForm: (template, data, options) => call(bindForm, [template, data, options]),
  bindButtons: (template, data, options) => call(bindButtons, [template, data, options]),
  createForm: (template, data, options) => call(createForm, [template, data, options]),
};

function caseOf(item: unknown): ShapeCase {
  assert(isRecord(item), 'a case is an object');
  const { name, operation, template, data, options, expect } = item;
  assert(typeof name === 'string' && typeof operation === 'string', 'a case has a name and an operation');
  return { name, operation, template, data, options, expect };
}

const cases: ShapeCase[] = (() => {
  const raw: unknown = JSON.parse(readFileSync(new URL('../../../../tests/fixtures/template-shape/cases.json', import.meta.url), 'utf8'));
  assert(Array.isArray(raw), 'the fixture is a list of cases');
  return raw.map(caseOf);
})();

describe('form template shape', () => {
  // The compiled cases of tests/fixtures/template-shape also test CURP-019 and CURP-024: a serialized compiled template is bound.
  for (const item of cases) {
    it(item.name, () => {
      const run = OPERATIONS[item.operation];
      assert(run, `${item.operation} is a template operation`);
      let caught: unknown;
      try { run(item.template, item.data, item.options); } catch (error) { caught = error; }
      if (item.expect === 'pass') {
        expect(caught).toBeUndefined();
        return;
      }
      assert(caught instanceof FormInputError, 'the operation throws a FormInputError');
      expect({ code: caught.code, message: caught.message, at: '' }).toStrictEqual(item.expect);
    });
  }

  it('bindButtons rejects a button whose type is no form button type', () => {
    const template: unknown = JSON.parse(JSON.stringify(compileForm({ type: 'group', properties: { name: { type: 'text' } } })));
    assert(isRecord(template) && Array.isArray(template.buttons), 'a compiled template has a list of buttons');
    const button: unknown = template.buttons[0];
    assert(isRecord(button), 'a compiled button is an object');
    button.type = 'other';
    // @ts-expect-error: a reshaped template is a record, which the type FormTemplate does not accept.
    expect(() => bindButtons(template)).toThrow(new FormInputError('Invalid button type: other'));
  });
  it('treats an undefined member as absent', () => {
    const template = compileForm({ type: 'group', properties: { name: { type: 'text' } } });
    expect(() => bindForm({ ...template, keyPrefix: undefined })).not.toThrow();
  });
});

describe('widget member order', () => {
  it('orders every widget model as the specification lists its members', () => {
    const template = compileForm({
      type: 'group',
      properties: {
        memo: { type: 'textarea', prepend: 'P' },
        note: { type: 'dummy' },
        go: { type: 'button' },
        kind: { type: 'search', options: { a: 'A' } },
        body: { type: 'tinymce' },
      },
    });
    const order = ['kind', 'layout', 'tag', 'attrs', 'text', 'rawHtml', 'source', 'options', 'itemLabelClass', 'script', 'styleChrome', 'prepend', 'append', 'extra'];
    for (const node of bindForm(template, {})) {
      assert(node.widget, 'a field node has a widget');
      const keys = Object.keys(node.widget);
      expect(keys).toEqual(order.filter(key => keys.includes(key)));
    }
  });
});
