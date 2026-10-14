import assert from 'node:assert/strict';
import { describe, expect, it } from 'vitest';
import { FormInputError } from '@polyspec/crudui-validator';
import { bindButtons, bindForm, compileForm, createForm } from './index';
import { isRecord } from './util';

type TemplateRecord = Record<string, unknown>;
/** A compiled template as decoded JSON, which a test reshapes. */
const compiled = (): TemplateRecord => {
  const template: unknown = JSON.parse(JSON.stringify(compileForm({ type: 'group', properties: { name: { type: 'text' } } })));
  assert(isRecord(template), 'a compiled template is an object');
  return template;
};
const firstField = (template: TemplateRecord): TemplateRecord => {
  assert(Array.isArray(template.fields), 'a compiled template has a list of fields');
  const field: unknown = template.fields[0];
  assert(isRecord(field), 'a compiled field is an object');
  return field;
};
const reshaped = (change: (template: TemplateRecord) => void) => {
  const template = compiled();
  change(template);
  return template;
};

describe('form template shape', () => {
  // Each entry takes the decoded JSON of a template, which only the check at run time makes a FormTemplate.
  const entries: [string, (template: TemplateRecord) => unknown][] = [
    // @ts-expect-error: a reshaped template is a record, which the type FormTemplate does not accept.
    ['bindForm', template => bindForm(template, { name: 'a' })],
    // @ts-expect-error: a reshaped template is a record, which the type FormTemplate does not accept.
    ['bindButtons', template => bindButtons(template, { name: 'a' })],
    // @ts-expect-error: a reshaped template is a record, which the type FormTemplate does not accept.
    ['createForm', template => createForm(template, { name: 'a' })],
  ];
  const shapes: [string, (template: TemplateRecord) => void][] = [
    ['missing fields', t => { delete t.fields; }],
    ['fields not a list', t => { t.fields = {}; }],
    ['a field that is not an object', t => { assert(Array.isArray(t.fields)); t.fields.push('name'); }],
    ['a field without children', t => { delete firstField(t).children; }],
    ['a field with an unknown member', t => { firstField(t).label = 'Name'; }],
    ['missing buttons', t => { delete t.buttons; }],
    ['buttons not a list', t => { t.buttons = {}; }],
    ['a button that is not an object', t => { t.buttons = [[]]; }],
    ['an unknown member', t => { t.version = 1; }],
    ['another kind', t => { t.kind = 'other'; }],
    ['a null keyPrefix', t => { t.keyPrefix = null; }],
    ['a string action', t => { t.action = '/save'; }],
  ];
  for (const [entry, run] of entries) {
    for (const [name, change] of shapes) {
      it(`${entry} rejects ${name}`, () => {
        let caught: unknown;
        try { run(reshaped(change)); } catch (error) { caught = error; }
        assert(caught instanceof FormInputError, 'the entry throws a FormInputError');
        expect(caught.message).toBe('Unsupported form template');
      });
    }
    it(`${entry} accepts the declared optional members`, () => {
      expect(() => run(reshaped(t => { t.keyPrefix = 'p'; t.action = { url: '/save' }; }))).not.toThrow();
    });
  }
  it('bindButtons rejects a button whose type is no form button type', () => {
    const template = reshaped(t => {
      assert(Array.isArray(t.buttons), 'a compiled template has a list of buttons');
      const button: unknown = t.buttons[0];
      assert(isRecord(button), 'a compiled button is an object');
      button.type = 'other';
    });
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
