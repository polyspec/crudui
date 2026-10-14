/** Resolve and run `data-crudui-action` buttons for forms and structure maps. */

import type { FormInstance } from './instance';

/** Operations a `data-crudui-action` button can request. */
export type FormActionName =
  | 'move-up'
  | 'move-down'
  | 'add-row'
  | 'copy-row'
  | 'remove-row'
  | 'toggle-row'
  | 'select-row'
  | 'expand-all'
  | 'collapse-all'
  | 'undo'
  | 'redo';

const ACTIONS: readonly FormActionName[] = [
  'move-up', 'move-down', 'add-row', 'copy-row', 'remove-row',
  'toggle-row', 'select-row', 'expand-all', 'collapse-all', 'undo', 'redo',
];

/** The operation, collection path and row key an action button targets. */
export interface ActionTarget {
  /** Requested operation. */
  name: FormActionName;
  /** Collection path of the nearest `[data-field-path]`. */
  path?: string;
  /** Row key of the nearest `[data-crudui-row-key]` inside that path element. */
  key?: string;
}

/** The row that receives focus after an action, or the collection itself when `key` is absent. */
export interface FocusTarget {
  /** Collection path. */
  path: string;
  /** Row key; absent when the collection has no rows left. */
  key?: string;
}

/** The outcome of an action that ran. */
export interface ActionResult {
  /** Focus destination; absent when focus stays on the current control. */
  focus?: FocusTarget;
}

/**
 * Resolve a button: the path is the nearest `[data-field-path]` at or above it;
 * the key is the nearest `[data-crudui-row-key]` inside that path element.
 */
export function resolveAction(button: Element): ActionTarget | undefined {
  const name = button.getAttribute('data-crudui-action') as FormActionName | null;
  if (!name || !ACTIONS.includes(name)) return undefined;
  const scope = button.closest('[data-field-path]');
  const path = scope?.getAttribute('data-field-path') ?? undefined;
  const row = button.closest('[data-crudui-row-key]');
  // A row outside the path element belongs to an ancestor collection.
  const key = scope && row && scope.contains(row) ? row.getAttribute('data-crudui-row-key') ?? undefined : undefined;
  return { name, ...(path ? { path } : {}), ...(key ? { key } : {}) };
}

/**
 * Run a resolved action. Returns undefined when the target lacks a required path
 * or key. Adding and copying focus the new row, moving focuses the moved row, and
 * removing focuses the previous row, then the next row, then the collection.
 */
export function runAction(form: FormInstance, target: ActionTarget): ActionResult | undefined {
  const { name, path, key } = target;
  if (name === 'expand-all' || name === 'collapse-all') {
    form.setAllExpanded(name === 'expand-all');
    return {};
  }
  if (name === 'undo') {
    form.undo();
    return {};
  }
  if (name === 'redo') {
    form.redo();
    return {};
  }
  if (!path) return undefined;
  if (name === 'add-row') {
    return { focus: { path, key: form.addRow(path, key === undefined ? {} : { afterKey: key }) } };
  }
  if (!key) return undefined;
  switch (name) {
    case 'copy-row':
      return { focus: { path, key: form.copyRow(path, key) } };
    case 'remove-row': {
      const keys = Object.keys(form.getValue(path) as Record<string, unknown>);
      const index = keys.indexOf(key);
      const neighbour = keys[index - 1] ?? keys[index + 1];
      form.removeRow(path, key);
      return { focus: neighbour === undefined ? { path } : { path, key: neighbour } };
    }
    case 'toggle-row':
      form.toggleRow(path, key);
      return {};
    case 'select-row':
      // Selecting changes no state: it only moves focus to the row.
      return { focus: { path, key } };
    default: {
      const keys = Object.keys(form.getValue(path) as Record<string, unknown>);
      form.moveRow(path, key, keys.indexOf(key) + (name === 'move-up' ? -1 : 1));
      return { focus: { path, key } };
    }
  }
}
