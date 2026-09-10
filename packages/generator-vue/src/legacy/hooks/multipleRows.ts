/**
 * Derive stable row keys for empty and static render input.
 *
 * Legacy semantics:
 *  - object-keyed data renders one row per `__<13hex>__` key;
 *  - array data renders one row per index (fresh keys);
 *  - empty data renders ONE blank placeholder row whose key is a fresh
 *    uniqid (PHP `[$parentId => null]`).
 *
 * No interactive add/remove/move is needed for reference parity (empty-data
 * fixtures); the React snapshot/commit machinery is intentionally omitted.
 */

import type { FormValue } from '../types';
import { generateUniqid } from '../utils/dataAttributes';

export interface MultipleRowsResult {
  rowKeys: string[];
  getRowValue: (key: string) => FormValue;
}

export function deriveMultipleRows(raw: FormValue): MultipleRowsResult {
  if (Array.isArray(raw) && raw.length > 0) {
    const keys = raw.map(() => generateUniqid());
    return {
      rowKeys: keys,
      getRowValue: (key) => {
        const idx = keys.indexOf(key);
        return idx === -1 ? undefined : (raw[idx] as FormValue);
      },
    };
  }
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    const keys = Object.keys(raw as Record<string, FormValue>);
    if (keys.length > 0) {
      return {
        rowKeys: keys,
        getRowValue: (key) => (raw as Record<string, FormValue>)[key],
      };
    }
  }
  // Empty: one blank placeholder row.
  const placeholder = generateUniqid();
  return { rowKeys: [placeholder], getRowValue: () => undefined };
}
