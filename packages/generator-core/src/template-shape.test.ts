import { describe, expect, it } from 'vitest';
import { FormInputError } from '@crudui/validator';
import { bindButtons, bindForm, compileForm, createForm } from './index';

const compiled = () => JSON.parse(JSON.stringify(compileForm({ type: 'group', properties: { name: { type: 'text' } } })));
const reshaped = (change: (template: Record<string, any>) => void) => {
  const template = compiled();
  change(template);
  return template;
};

describe('form template shape', () => {
  const entries: [string, (template: never) => unknown][] = [
    ['bindForm', template => bindForm(template, { name: 'a' })],
    ['bindButtons', template => bindButtons(template, { name: 'a' })],
    ['createForm', template => createForm(template, { name: 'a' })],
  ];
  const shapes: [string, (template: Record<string, any>) => void][] = [
    ['missing fields', t => { delete t.fields; }],
    ['fields not a list', t => { t.fields = {}; }],
    ['a field that is not an object', t => { t.fields.push('name'); }],
    ['a field without children', t => { delete t.fields[0].children; }],
    ['a field with an unknown member', t => { t.fields[0].label = 'Name'; }],
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
        try { run(reshaped(change) as never); } catch (error) { caught = error; }
        expect(caught).toBeInstanceOf(FormInputError);
        expect((caught as Error).message).toBe('Unsupported form template');
      });
    }
    it(`${entry} accepts the declared optional members`, () => {
      expect(() => run(reshaped(t => { t.keyPrefix = 'p'; t.action = { url: '/save' }; }) as never)).not.toThrow();
    });
  }
  it('treats an undefined member as absent', () => {
    expect(() => bindForm({ ...compiled(), keyPrefix: undefined })).not.toThrow();
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
    const order = ['kind', 'layout', 'tag', 'attrs', 'text', 'rawHtml', 'source', 'options', 'itemLabelClass', 'script', 'styleChrome', 'buttonText', 'prepend', 'append', 'extra'];
    for (const node of bindForm(template, {})) {
      const keys = Object.keys((node as { widget: object }).widget);
      expect(keys).toEqual(order.filter(key => keys.includes(key)));
    }
  });
});
