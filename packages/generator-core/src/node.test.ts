import { describe, expect, it } from 'vitest';
import {
  bindForm,
  buildOutline,
  compileForm,
  createForm,
  formMessages,
  runAction,
  type NodeVM,
} from './index';

const k1 = '__0000000000001__';
const k2 = '__0000000000002__';

const spec = {
  type: 'group',
  properties: {
    teams: {
      type: 'group',
      label: 'Team',
      multiple: { min: 1, max: 2, sortable: true, copy: true, title: 'name', header: 'sticky' },
      properties: {
        name: { type: 'text', label: 'Name' },
        members: { type: 'text', label: 'Member', multiple: { controls: 'footer' } },
      },
    },
  },
};

const data = {
  teams: {
    [k1]: { name: 'Sales', members: { [k1]: 'Kim', [k2]: 'Lee' } },
    [k2]: { name: '', members: {} },
  },
};

function actions(node: NodeVM) {
  return node.controls!.actions.map(action => [action.name, action.disabled]);
}

describe('node grammar view model', () => {
  const [teams] = bindForm(compileForm(spec), data, { language: 'en' });
  const [first, second] = teams!.children!;

  it('describes collections and rows with numbers, titles, counts and summaries', () => {
    expect(teams).toMatchObject({ kind: 'collection', path: 'teams', item: 'group', header: { label: 'Team', count: 'Rows: 2' } });
    expect(first).toMatchObject({
      kind: 'row', key: k1, collapsible: true, expanded: true, sticky: true, stickyDepth: 0,
      header: { label: 'Team', number: '1', title: 'Sales', summary: 'Nested rows: 2' },
      body: { id: `crudui:teams.${k1}:body` },
    });
    expect(second!.header).toMatchObject({ number: '2', title: '(untitled)', summary: 'Nested rows: 0' });
    const members = first!.children!.find(child => child.kind === 'collection')!;
    expect(members.children!.map(row => [row.header!.number, row.collapsible, row.controls!.placement]))
      .toEqual([['1.1', undefined, 'footer'], ['1.2', undefined, 'footer']]);
  });

  it('computes control order and disabled states from limits and position', () => {
    expect(actions(first!)).toEqual([
      ['move-up', true], ['move-down', false], ['add-row', true], ['copy-row', true], ['remove-row', false],
    ]);
    expect(actions(second!)).toEqual([
      ['move-up', false], ['move-down', true], ['add-row', true], ['copy-row', true], ['remove-row', false],
    ]);
    const emptyMembers = second!.children!.find(child => child.kind === 'collection')!;
    expect(emptyMembers.controls).toEqual({
      placement: 'footer', label: 'Collection controls', actions: [{ name: 'add-row', label: 'Add', disabled: false }],
    });
  });

  it('renders collapsed rows from the collapsed option', () => {
    const [collapsed] = bindForm(compileForm(spec), data, { collapsed: new Set([`teams.${k1}`]) });
    expect(collapsed!.children!.map(row => row.expanded)).toEqual([false, true]);
  });

  it('marks hidden nodes and omits empty headers', () => {
    const template = compileForm({ type: 'group', properties: {
      secret: { type: 'hidden' },
      note: { type: 'text', design: { show: false } },
    } });
    const [secret, note] = bindForm(template, {});
    expect(secret!.header).toBeUndefined();
    expect(note!.hidden).toBe(true);
  });
});

describe('interface messages', () => {
  it('supports ko, en, ja and zh and rejects other languages', () => {
    for (const language of ['ko', 'en', 'ja', 'zh']) expect(formMessages(language).addRow).toBeTruthy();
    expect(() => formMessages('fr')).toThrow('Unsupported language: fr');
    expect(() => bindForm(compileForm(spec), data, { language: 'fr' as never })).toThrow('Unsupported language: fr');
    expect(() => formMessages('')).toThrow('Unsupported language: ');
    for (const language of [5, true, ['ko'], { ko: 1 }]) {
      expect(() => bindForm(compileForm(spec), data, { language: language as never })).toThrow('Language must be a string');
    }
    for (const name of ['keyPrefix', 'idPrefix']) {
      expect(() => bindForm(compileForm(spec), data, { language: 5, [name]: 5 } as never)).toThrow('Language must be a string');
      expect(() => bindForm(compileForm(spec), data, { language: 'fr', [name]: 5 } as never)).toThrow(`${name} must be a string`);
    }
    for (const unsupported of [true, 'other']) {
      expect(() => bindForm(compileForm(spec), data, { language: 'fr', keyPrefix: 'p', unsupported } as never))
        .toThrow('unsupported must be throw or marker');
    }
  });
});

describe('multiple layout declarations', () => {
  const compile = (field: Record<string, unknown>) => () => compileForm({ type: 'group', properties: { rows: field } });
  it('rejects titles, control placements and header modes with wrong values', () => {
    expect(compile({ type: 'text', multiple: { title: 'name' } }))
      .toThrow('Invalid multiple.title at rows: expected a repeated group');
    for (const title of ['missing', 'children', 'labels', 3]) {
      expect(compile({ type: 'group', multiple: { title }, properties: {
        name: { type: 'text' },
        children: { type: 'text', multiple: true },
        labels: { type: 'text', lang: true },
      } })).toThrow('Invalid multiple.title at rows: expected the name of a direct child field without multiple, properties or lang');
    }
    expect(compile({ type: 'text', multiple: { controls: 'side' } }))
      .toThrow('Invalid multiple.controls at rows: expected header, footer or outline');
    expect(compile({ type: 'text', multiple: { header: 'fixed' } }))
      .toThrow('Invalid multiple.header at rows: expected static or sticky');
    for (const lang of [null, 'ko', ['ko']]) {
      expect(compile({ type: 'text', lang })).toThrow('Invalid lang at rows: expected a boolean or an object');
    }
    for (const only of ['ko', null, ['ko', 3]]) {
      expect(compile({ type: 'text', lang: { only } }))
        .toThrow('Invalid lang.only at rows: expected a list of language codes or an object');
    }
    expect(compile({ type: 'text', lang: { only: ['ko', 'en'] } })).not.toThrow();
    expect(compile({ type: 'text', multiple: 'yes', lang: null }))
      .toThrow('Invalid multiple at rows: expected a boolean or an object');
  });
});

describe('instance view state and undo', () => {
  it('toggles, collapses and expands rows without changing data or revision', () => {
    const form = createForm(compileForm(spec), data);
    const { revision } = form.getSnapshot();
    form.toggleRow('teams', k1);
    expect(form.getSnapshot().fields[0]!.children!.map(row => row.expanded)).toEqual([false, true]);
    form.setAllExpanded(false);
    expect(form.getSnapshot().fields[0]!.children!.map(row => row.expanded)).toEqual([false, false]);
    form.setAllExpanded(true);
    expect(form.getSnapshot().fields[0]!.children!.map(row => row.expanded)).toEqual([true, true]);
    expect(form.getSnapshot().revision).toBe(revision);
    expect(form.getData()).toEqual(data);
  });

  it('merges consecutive edits of one path into one undo entry', () => {
    const form = createForm(compileForm(spec), data);
    expect(form.getSnapshot().canUndo).toBe(false);
    form.setValue(`teams.${k1}.name`, 'S');
    form.setValue(`teams.${k1}.name`, 'Sa');
    form.setValue(`teams.${k2}.name`, 'Ops');
    expect(form.getSnapshot().canUndo).toBe(true);
    form.undo();
    expect(form.getValue(`teams.${k2}.name`)).toBe('');
    expect(form.getValue(`teams.${k1}.name`)).toBe('Sa');
    form.undo();
    expect(form.getValue(`teams.${k1}.name`)).toBe('Sales');
    expect(form.getSnapshot().canUndo).toBe(false);
    expect(() => form.undo()).toThrow('Nothing to undo');
  });

  it('restarts history and view state when the record is replaced', () => {
    const form = createForm(compileForm(spec), data);
    form.removeRow(`teams.${k1}.members`, k2);
    form.toggleRow('teams', k1);
    form.selectRow('teams', k2);
    form.setData(data);
    const snapshot = form.getSnapshot();
    expect(snapshot.canUndo).toBe(false);
    expect(snapshot.selection).toBeUndefined();
    expect(snapshot.fields[0]!.children!.map(row => row.expanded)).toEqual([true, true]);
  });

  it('keeps view state attached to rows through removal and rekeying', () => {
    const form = createForm(compileForm(spec), data);
    form.toggleRow('teams', k2);
    form.selectRow('teams', k2);
    form.rekeyRow('teams', k2, '__0000000000042__');
    expect(form.getSnapshot().selection).toEqual({ path: 'teams', key: '__0000000000042__' });
    expect(form.getSnapshot().fields[0]!.children![1]!.expanded).toBe(false);
    form.removeRow('teams', '__0000000000042__');
    expect(form.getSnapshot().selection).toBeUndefined();
    form.undo();
    expect(form.getSnapshot().fields[0]!.children![1]!.expanded).toBe(true);
  });
});

describe('structure map and actions', () => {
  it('maps collections and rows, marking the selected row', () => {
    const form = createForm(compileForm(spec), data, { language: 'en' });
    form.selectRow('teams', k2);
    const [teams] = buildOutline(form.getSnapshot().fields, form.getSnapshot().selection);
    expect(teams).toMatchObject({ path: 'teams', label: 'Team', count: 'Rows: 2' });
    expect(teams!.rows.map(row => [row.number, row.title, row.current])).toEqual([['1', 'Sales', false], ['2', '(untitled)', true]]);
    expect(teams!.rows[0]!.collections[0]).toMatchObject({ path: `teams.${k1}.members`, count: 'Rows: 2' });
  });

  it('runs resolved actions against the instance', () => {
    const form = createForm(compileForm(spec), { teams: { [k1]: { name: 'Sales', members: {} } } });
    const members = `teams.${k1}.members`;
    const added = runAction(form, { name: 'add-row', path: members });
    const [member] = Object.keys(form.getValue(members) as object);
    expect(added).toEqual({ focus: { path: members, key: member } });
    expect(runAction(form, { name: 'remove-row', path: 'teams' })).toBeUndefined();
    expect(runAction(form, { name: 'toggle-row', path: 'teams', key: k1 })).toEqual({});
    expect(form.getSnapshot().fields[0]!.children![0]!.expanded).toBe(false);
    expect(runAction(form, { name: 'undo' })).toEqual({});
    expect(form.getValue(members)).toEqual({});
  });

  it('returns the row that receives focus after copying, moving and removing', () => {
    const form = createForm(compileForm(spec), data);
    // teams allows at most two rows, so remove one before copying.
    expect(runAction(form, { name: 'remove-row', path: 'teams', key: k1 })).toEqual({ focus: { path: 'teams', key: k2 } });
    const copied = runAction(form, { name: 'copy-row', path: 'teams', key: k2 })!;
    const [, copy] = Object.keys(form.getValue('teams') as object);
    expect(copied).toEqual({ focus: { path: 'teams', key: copy } });
    expect(runAction(form, { name: 'move-down', path: 'teams', key: k2 })).toEqual({ focus: { path: 'teams', key: k2 } });
    expect(runAction(form, { name: 'remove-row', path: 'teams', key: k2 })).toEqual({ focus: { path: 'teams', key: copy } });
    form.undo();
    form.undo();
    form.undo();
    form.undo();
    const members = `teams.${k1}.members`;
    expect(runAction(form, { name: 'remove-row', path: members, key: k1 })).toEqual({ focus: { path: members, key: k2 } });
    expect(runAction(form, { name: 'remove-row', path: members, key: k2 })).toEqual({ focus: { path: members } });
  });
});
