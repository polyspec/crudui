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
  | 'undo';

const ACTIONS: readonly FormActionName[] = [
  'move-up', 'move-down', 'add-row', 'copy-row', 'remove-row',
  'toggle-row', 'select-row', 'expand-all', 'collapse-all', 'undo',
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

/** Run a resolved action. Returns false when the target lacks a required path or key. */
export function runAction(form: FormInstance, target: ActionTarget): boolean {
  const { name, path, key } = target;
  if (name === 'expand-all' || name === 'collapse-all') {
    form.setAllExpanded(name === 'expand-all');
    return true;
  }
  if (name === 'undo') {
    form.undo();
    return true;
  }
  if (!path) return false;
  if (name === 'add-row') {
    form.addRow(path, key === undefined ? {} : { afterKey: key });
    return true;
  }
  if (!key) return false;
  switch (name) {
    case 'copy-row': form.copyRow(path, key); break;
    case 'remove-row': form.removeRow(path, key); break;
    case 'toggle-row': form.toggleRow(path, key); break;
    case 'select-row': form.selectRow(path, key); break;
    default: {
      const keys = Object.keys(form.getValue(path) as Record<string, unknown>);
      form.moveRow(path, key, keys.indexOf(key) + (name === 'move-up' ? -1 : 1));
    }
  }
  return true;
}
