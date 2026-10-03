import { describe, expect, it } from 'vitest';
import { bindForm, compileForm, type NodeVM } from './index';

// Layout (docs/spec/schema.md, Layout; docs/spec/form-markup.md, Layout).
const G = (properties: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ type: 'group', ...extra, properties });
const nodes = (spec: Record<string, unknown>, data: Record<string, unknown> = {}): NodeVM[] =>
  bindForm(compileForm(spec), data, { language: 'en' });
const rejection = (spec: Record<string, unknown>): string => {
  try {
    compileForm(spec);
  } catch (error) {
    expect((error as { code?: string }).code).toBe('INVALID_FORM_INPUT');
    return (error as Error).message;
  }
  throw new Error('compileForm accepted the specification');
};
const classes = (node: NodeVM): string => node.className;

describe('layout in the node model', () => {
  const settings = G({
    look: {
      type: 'group',
      label: 'Look',
      design: { layout: 'inline', wrapper: { class: 'section' } },
      properties: {
        theme: { type: 'text', label: 'Theme', design: { wrapper: { class: 'wide' } } },
        bare: { type: 'text' },
        font: {
          type: 'group',
          label: 'Font',
          design: { layout: 'line' },
          properties: { family: { type: 'text' }, size: { type: 'text' } },
        },
        nested: { type: 'group', properties: { deep: { type: 'checkbox', label: 'Deep' } } },
        plain: { type: 'group', design: { layout: 'stacked' }, properties: { flat: { type: 'text' } } },
        names: { type: 'text', lang: { only: ['en'] } },
      },
    },
    outside: { type: 'text' },
  });

  it('marks every field node of an inline group, at any depth, with the inline modifier', () => {
    const [look, outside] = nodes(settings);
    const [theme, bare, font, nested, plain, names] = look!.children!;
    expect(classes(look!)).toBe('section');
    expect(classes(theme!)).toBe('crudui-node--inline wide');
    expect(classes(bare!)).toBe('crudui-node--inline');
    expect(classes(nested!)).toBe('');
    expect(classes(nested!.children![0]!)).toBe('crudui-node--inline');
    expect(classes(names!)).toBe('crudui-node--framed');
    expect(classes(outside!)).toBe('');
    expect(classes(plain!)).toBe('');
    expect(classes(plain!.children![0]!)).toBe('');
    expect(classes(font!)).toBe('crudui-node--inline crudui-node--line');
    expect(font!.children!.map(classes)).toEqual(['', '']);
  });

  it('lays out a line group outside an inline layout without the inline modifier', () => {
    const [line] = nodes(G({ actions: { type: 'group', design: { layout: 'line' }, properties: { a: { type: 'text' } } } }));
    expect(classes(line!)).toBe('crudui-node--line');
  });

  it('applies an inline repeated group to the fields of its rows', () => {
    const [rows] = nodes(G({ rows: { type: 'group', multiple: true, design: { layout: 'inline' }, properties: { name: { type: 'text' } } } }),
      { rows: { a: { name: 'x' } } });
    expect(classes(rows!)).toBe('');
    expect(classes(rows!.children![0]!)).toBe('');
    expect(classes(rows!.children![0]!.children![0]!)).toBe('crudui-node--inline');
  });
});

describe('layout declaration checks', () => {
  it('accepts design.layout only on a group field', () => {
    expect(rejection(G({ a: { type: 'text', design: { layout: 'inline' } } }))).toBe('Invalid design.layout at a: unknown key');
    expect(rejection(G({ a: { type: 'text' } }, { design: { layout: 'inline' } }))).toBe('Invalid design.layout at form: unknown key');
    expect(rejection({ ...G({ a: { type: 'text' } }), buttons: [{ type: 'submit', design: { layout: 'inline' } }] }))
      .toBe('Invalid design.layout at form.buttons.0: unknown key');
  });

  it('accepts stacked, inline or line, and no line on a repeated group', () => {
    expect(rejection(G({ a: { type: 'group', design: { layout: 'grid' }, properties: {} } })))
      .toBe('Invalid design.layout at a: expected stacked, inline or line');
    expect(rejection(G({ a: { type: 'group', design: { layout: { '.wide': 'inline' } }, properties: {} } })))
      .toBe('Invalid design.layout at a: expected stacked, inline or line');
    expect(rejection(G({ a: { type: 'group', multiple: true, design: { layout: 'line' }, properties: {} } })))
      .toBe('Invalid design.layout at a: expected stacked or inline');
  });
});
