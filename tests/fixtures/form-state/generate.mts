/**
 * Generates the shared form state fixtures of five families: `form-view`, `form-history` and `form-actions` (sessions of
 * operations on a form instance) and `view-functions` and `history-functions` (the pure functions of the view and the
 * history).
 *
 * A form state case is `{ name, note, requirements, spec, data, options, steps, expected }`. Each step is
 * `{ op, args }` and `expected[i]` is what the TypeScript reference observed after step `i`: `result` or `error`
 * (`code`, `message`), then `data`, `revision`, `canUndo`, `canRedo` and `collapsed`, the row paths whose row is
 * collapsed. A row key that the case does not name (spec, data and steps) is one that an operation generated; the
 * observation names it `$1`, `$2` in order of first appearance, so the output is the same in every implementation.
 * A function case is `{ name, note, requirements, op, args, expected }`.
 *
 * Do not edit the `cases.json` files by hand. Regenerate:
 *   node tests/fixtures/form-state/generate.mts
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as core from '@polyspec/crudui-generator-core';
import { observeFunction, observeSession, type Json, type Step } from './harness.mts';

interface Case { name: string; note: string; requirements: string[]; [key: string]: Json }

const here = dirname(fileURLToPath(import.meta.url));
const k = (n: number): string => `__${String(n).padStart(13, '0')}__`;
const A = k(1);
const B = k(2);
const M1 = k(11);
const M2 = k(12);
const M3 = k(13);

const spec: Json = {
  type: 'group',
  properties: {
    teams: {
      type: 'group',
      label: 'Team',
      multiple: { min: 1, max: 5, sortable: true, copy: true, title: 'name' },
      properties: {
        name: { type: 'text', label: 'Name' },
        members: {
          type: 'group',
          label: 'Member',
          multiple: { title: 'name' },
          properties: { name: { type: 'text', label: 'Name' } },
        },
      },
    },
    note: { type: 'text', label: 'Note' },
  },
};

const data: Json = {
  teams: {
    [A]: { name: 'Alpha', members: { [M1]: { name: 'One' }, [M2]: { name: 'Two' } } },
    [B]: { name: 'Beta', members: { [M3]: { name: 'Three' } } },
  },
  note: '',
};


/** The runtime requirements (runtime-packages.md) that a session tests: each session creates an instance and reads its data; a replace, a row operation and a failing operation are tested where a step performs them. */
const ROW_OPERATIONS = ['addRow', 'copyRow', 'removeRow', 'moveRow', 'rekeyRow'];
const ROW_ACTIONS = ['add-row', 'copy-row', 'remove-row', 'move-up', 'move-down'];
function runtimeRequirements(steps: Step[]): string[] {
  const ids = ['CURP-010', 'CURP-012'];
  if (steps.some(({ op }) => op === 'setData')) ids.push('CURP-011');
  const rowStep = steps.some(({ op, args }) => {
    if (ROW_OPERATIONS.includes(op)) return true;
    const target = args[0];
    const name = typeof target === 'object' && target !== null && !Array.isArray(target) ? target.name : undefined;
    return op === 'runAction' && typeof name === 'string' && ROW_ACTIONS.includes(name);
  });
  if (rowStep) ids.push('CURP-027');
  return ids;
}

function session(entry: { name: string; note: string; requirements: string[]; steps: Step[] }, history = true): Case {
  const steps: Json[] = entry.steps.map(({ op, args }) => ({ op, args }));
  return { name: entry.name, note: entry.note, requirements: [...entry.requirements, ...runtimeRequirements(entry.steps)], spec, data, steps, expected: observeSession(core, { spec, data, steps: entry.steps }, history) };
}

const step = (op: string, ...args: Json[]): Step => ({ op, args });
const run = (target: Json): Step => step('runAction', target);

const all: Case[] = [
  session({
    name: 'toggle-row-collapses-and-expands',
    note: 'A toggle collapses a row, a second toggle expands it again, a nested row collapses after its parent, and an unknown row fails; the revision does not change.',
    requirements: ['CURT-009', 'CURT-067', 'CURT-068'],
    steps: [
      step('toggleRow', 'teams', A),
      step('toggleRow', `teams.${A}.members`, M1),
      step('toggleRow', 'teams', A),
      step('toggleRow', 'teams', k(9)),
      step('toggleRow', 'teams', A),
    ],
  }, false),
  session({
    name: 'set-all-expanded-collapses-every-collapsible-row',
    note: 'Collapsing every row lists the collapsible rows depth first; expanding all clears the view.',
    requirements: ['CURT-010', 'CURT-073'],
    steps: [step('setAllExpanded', false), step('toggleRow', 'teams', B), step('setAllExpanded', true), step('setAllExpanded', false)],
  }, false),
  session({
    name: 'row-removal-drops-and-rekey-moves-view',
    note: 'Removing a row drops the collapsed state of the row and of its rows; rekeying moves it to the new key.',
    requirements: ['CURT-066', 'CURT-075', 'CURT-074', 'CURT-006', 'CURT-008'],
    steps: [
      step('setAllExpanded', false),
      step('rekeyRow', 'teams', A, k(3)),
      step('removeRow', 'teams', B),
      step('rekeyRow', `teams.${k(3)}.members`, M2, k(14)),
    ],
  }, false),
  session({
    name: 'set-data-restarts-history-and-view',
    note: 'Replacing the record clears the history and expands every row.',
    requirements: ['CURT-065'],
    steps: [
      step('setValue', 'note', 'first'),
      step('setAllExpanded', false),
      step('setData', data),
      step('undo'),
    ],
  }),
  session({
    name: 'undo-and-redo-restore-the-record',
    note: 'Undo restores the record before the change and redo reapplies it; each changes the revision; nothing to undo or redo fails.',
    requirements: ['CURT-011', 'CURT-012', 'CURT-061', 'CURT-067', 'CURT-004'],
    steps: [
      step('undo'),
      step('setValue', 'note', 'one'),
      step('addRow', 'teams', { key: k(5) }),
      step('undo'),
      step('undo'),
      step('redo'),
      step('redo'),
      step('redo'),
    ],
  }),
  session({
    name: 'same-path-edits-share-one-record',
    note: 'Consecutive edits of one path share a history record; an edit of another path or another change starts a new one.',
    requirements: ['CURT-063'],
    steps: [
      step('setValue', 'note', 'a'),
      step('setValue', 'note', 'ab'),
      step('setValue', `teams.${A}.name`, 'Alpha 2'),
      step('setValue', 'note', 'abc'),
      step('undo'),
      step('undo'),
      step('undo'),
      step('undo'),
    ],
  }),
  session({
    name: 'a-change-after-undo-clears-redo',
    note: 'A data change after undo clears the redo records.',
    requirements: ['CURT-064', 'CURT-061'],
    steps: [step('setValue', 'note', 'a'), step('undo'), step('setValue', 'note', 'b'), step('redo')],
  }),
  session({
    name: 'history-keeps-100-records',
    note: 'After 105 edits that alternate between two paths, 100 undos succeed and the next one fails.',
    requirements: ['CURT-062'],
    steps: [
      ...Array.from({ length: 105 }, (_, i) => step('setValue', i % 2 === 0 ? 'note' : `teams.${A}.name`, `v${i}`)),
      ...Array.from({ length: 101 }, () => step('undo')),
    ],
  }),
  session({
    name: 'resolve-action-names',
    note: 'An action resolves to a target with a non-empty path and key; an unknown or empty action resolves to nothing.',
    requirements: ['CURT-081'],
    steps: [
      step('resolveAction', { action: 'add-row', path: 'teams', key: A }),
      step('resolveAction', { action: 'undo' }),
      step('resolveAction', { action: 'move-up', path: '', key: '' }),
      step('resolveAction', { action: 'rename-row', path: 'teams' }),
      step('resolveAction', { action: '' }),
      step('resolveAction', {}),
    ],
  }),
  session({
    name: 'run-action-view-and-history',
    note: 'Expand all, collapse all, undo and redo return a result without focus; toggle-row collapses a row.',
    requirements: ['CURT-082', 'CURT-087', 'CURT-011', 'CURT-012'],
    steps: [
      run({ name: 'collapse-all' }),
      run({ name: 'expand-all' }),
      run({ name: 'toggle-row', path: 'teams', key: A }),
      run({ name: 'undo' }),
      step('setValue', 'note', 'x'),
      run({ name: 'undo' }),
      run({ name: 'redo' }),
      run({ name: 'redo' }),
    ],
  }),
  session({
    name: 'run-action-without-path-or-key',
    note: 'A path or key that an action needs is missing: no result and no change; add-row needs no key.',
    requirements: ['CURT-083'],
    steps: [
      run({ name: 'add-row' }),
      run({ name: 'copy-row', path: 'teams' }),
      run({ name: 'remove-row', key: A }),
      run({ name: 'toggle-row', path: 'teams' }),
      run({ name: 'select-row', key: A }),
      run({ name: 'move-up', path: 'teams' }),
    ],
  }),
  session({
    name: 'run-action-add-and-copy-row',
    note: 'Adding focuses the new row after the given row or last, and copying focuses the copy right after the original.',
    requirements: ['CURT-084', 'CURT-085', 'CURT-005'],
    steps: [
      run({ name: 'add-row', path: 'teams', key: A }),
      run({ name: 'copy-row', path: 'teams', key: B }),
      run({ name: 'add-row', path: 'teams', key: A }),
      run({ name: 'copy-row', path: `teams.${A}.members`, key: M1 }),
    ],
  }),
  session({
    name: 'run-action-remove-row-focus',
    note: 'Removing focuses the previous row, then the next row, then the collection.',
    requirements: ['CURT-086'],
    steps: [
      run({ name: 'remove-row', path: 'teams', key: B }),
      run({ name: 'remove-row', path: `teams.${A}.members`, key: M1 }),
      run({ name: 'remove-row', path: `teams.${A}.members`, key: M2 }),
      run({ name: 'remove-row', path: 'teams', key: A }),
    ],
  }),
  session({
    name: 'run-action-select-row',
    note: 'Selecting changes nothing and focuses the row, also a row that does not exist.',
    requirements: ['CURT-088'],
    steps: [run({ name: 'select-row', path: 'teams', key: A }), run({ name: 'select-row', path: 'teams', key: k(9) })],
  }),
  session({
    name: 'run-action-move-row',
    note: 'Moving up or down focuses the moved row; moving past an end fails and changes nothing.',
    requirements: ['CURT-089', 'CURT-090', 'CURT-007'],
    steps: [
      run({ name: 'move-up', path: 'teams', key: B }),
      run({ name: 'move-up', path: 'teams', key: B }),
      run({ name: 'move-down', path: 'teams', key: B }),
      run({ name: 'move-down', path: 'teams', key: B }),
    ],
  }),
  session({
    name: 'run-action-errors',
    note: 'An operation that fails fails the action: an unknown row, a path that is no keyed collection, an unknown collection, nothing to undo.',
    requirements: ['CURT-090', 'CURT-082'],
    steps: [
      run({ name: 'remove-row', path: 'teams', key: k(9) }),
      run({ name: 'toggle-row', path: 'teams', key: k(9) }),
      run({ name: 'add-row', path: 'note' }),
      run({ name: 'add-row', path: 'missing' }),
      run({ name: 'undo' }),
      run({ name: 'redo' }),
    ],
  }),
  session({
    name: 'run-action-unknown-name',
    note: 'A target whose name is none of the eleven actions fails, with or without a path and key, and changes nothing.',
    requirements: ['CURT-091'],
    steps: [
      run({ name: 'rename-row', path: 'teams', key: k(1) }),
      run({ name: 'rename-row' }),
      run({ name: '' }),
    ],
  }),
];


const viewCases: Case[] = [];
const historyCases: Case[] = [];
const fn = (family: Case[], name: string, note: string, requirements: string[], op: string, args: Json[]): void => {
  family.push({ name, note, requirements, op, args, expected: observeFunction(core, { op, args }) });
};
const viewOf = (...collapsed: string[]): Json => ({ collapsed });
const rowA = `teams.${A}`;
const rowM1 = `teams.${A}.members.${M1}`;
const plain: Json = { type: 'group', properties: { a: { type: 'text' } } };

fn(viewCases, 'initial-view', 'The initial view has no collapsed row.', ['CURT-070', 'CURT-068'], 'initialView', []);
fn(viewCases, 'toggle-collapses-and-appends', 'A toggled expanded row is appended to the collapsed rows.', ['CURT-071'], 'toggleRowView', [viewOf(rowM1), rowA]);
fn(viewCases, 'toggle-expands', 'A toggled collapsed row leaves the others in order.', ['CURT-071'], 'toggleRowView', [viewOf(rowA, rowM1, `teams.${B}`), rowM1]);
fn(viewCases, 'collapsible-rows-depth-first', 'The collapsible rows of the evaluated nodes in node order, depth first.', ['CURT-072'], 'collapsibleRows', [spec, data]);
fn(viewCases, 'collapsible-rows-without-collections', 'A form without repeated fields has no collapsible row.', ['CURT-072'], 'collapsibleRows', [plain, {}]);
fn(viewCases, 'set-all-collapsed', 'Collapsing all collapses the collapsible rows of the nodes.', ['CURT-073'], 'setAllExpandedView', [spec, data, false]);
fn(viewCases, 'set-all-expanded', 'Expanding all returns the view with no collapsed row.', ['CURT-073'], 'setAllExpandedView', [spec, data, true]);
fn(viewCases, 'remove-row-drops-inner-paths', 'Removing a row drops its path and the paths inside it, not a path that only starts with the same text.', ['CURT-074'], 'removeRowView', [viewOf(rowA, rowM1, `${rowA}x`, `teams.${B}`), rowA]);
fn(viewCases, 'rekey-row-renames-prefix', 'Rekeying replaces the prefix of the row path and of the paths inside it and keeps the order.', ['CURT-075'], 'rekeyRowView', [viewOf(`teams.${B}`, rowM1, rowA, `${rowA}x`), rowA, `teams.${k(3)}`]);
fn(viewCases, 'bind-form-collapsed-option', 'The bindForm option collapsed renders the listed collapsible rows collapsed and the others expanded.', ['CURT-069'], 'bindCollapsed', [spec, data, [rowA, rowM1, 'teams.__missing__']]);
fn(viewCases, 'bind-form-without-collapsed-option', 'Without the option every row is expanded.', ['CURT-069', 'CURT-068'], 'bindCollapsed', [spec, data, null]);

const hist = (entries: Json[], redoEntries: Json[] = [], lastPath?: string): Json => ({ entries, redoEntries, ...(lastPath === undefined ? {} : { lastPath }) });
const range = (from: number, to: number): Json[] => Array.from({ length: to - from }, (_, i) => from + i);
fn(historyCases, 'empty-history', 'The empty history has no entries.', ['CURT-076'], 'emptyHistory', []);
fn(historyCases, 'record-appends-and-clears-redo', 'A record appends the previous record, clears redo and sets the path.', ['CURT-077'], 'recordChange', [hist(['a'], ['z'], 'p'), 'b', 'q']);
fn(historyCases, 'record-same-path-shares-entry', 'A value edit on the path of the last edit adds no entry.', ['CURT-077', 'CURT-063'], 'recordChange', [hist(['a'], [], 'p'), 'b', 'p']);
fn(historyCases, 'record-without-path-drops-last-path', 'A change without a path adds an entry and leaves no path.', ['CURT-077'], 'recordChange', [hist(['a'], [], 'p'), 'b', null]);
fn(historyCases, 'record-keeps-100-entries', 'The 101st entry drops the oldest.', ['CURT-077', 'CURT-062'], 'recordChange', [hist(range(0, 100)), 100, null]);
fn(historyCases, 'can-undo-and-redo-empty', 'An empty history can do neither.', ['CURT-078'], 'canUndoRedo', [hist([])]);
fn(historyCases, 'can-undo-and-redo-filled', 'An entry allows undo and a redo entry allows redo.', ['CURT-078'], 'canUndoRedo', [hist(['a'], ['b'])]);
fn(historyCases, 'undo-moves-the-record', 'Undo takes the last entry, queues the current record for redo and drops the path.', ['CURT-079'], 'undoChange', [hist(['a', 'b'], ['x'], 'p'), 'c']);
fn(historyCases, 'undo-keeps-100-redo-entries', 'The redo records are limited to 100.', ['CURT-079', 'CURT-062'], 'undoChange', [hist(['a'], range(0, 100)), 'c']);
fn(historyCases, 'undo-of-empty-fails', 'An empty history fails.', ['CURT-079'], 'undoChange', [hist([]), 'c']);
fn(historyCases, 'redo-moves-the-record', 'Redo takes the last redo entry and appends the current record to the entries.', ['CURT-080'], 'redoChange', [hist(['a'], ['x', 'y'], 'p'), 'c']);
fn(historyCases, 'redo-keeps-100-entries', 'The entries are limited to 100.', ['CURT-080', 'CURT-062'], 'redoChange', [hist(range(0, 100), ['x']), 'c']);
fn(historyCases, 'redo-without-redo-entry-fails', 'A history without a redo entry fails.', ['CURT-080'], 'redoChange', [hist(['a']), 'c']);

const sessions = (names: string[]): Case[] => names.map(name => {
  const found = all.find(entry => entry.name === name);
  if (!found) throw new Error(`Unknown session: ${name}`);
  return found;
});
const view = sessions(['toggle-row-collapses-and-expands', 'set-all-expanded-collapses-every-collapsible-row', 'row-removal-drops-and-rekey-moves-view']);
const historySessions = sessions(['set-data-restarts-history-and-view', 'undo-and-redo-restore-the-record', 'same-path-edits-share-one-record', 'a-change-after-undo-clears-redo', 'history-keeps-100-records']);
const actions = all.filter(entry => !view.includes(entry) && !historySessions.includes(entry));

for (const [folder, cases] of [['form-view', view], ['form-history', historySessions], ['form-actions', actions], ['view-functions', viewCases], ['history-functions', historyCases]] as const) {
  writeFileSync(resolve(here, '..', folder, 'cases.json'), `${JSON.stringify(cases, null, 2)}\n`);
}
