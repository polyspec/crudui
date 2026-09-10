/**
 * useMultiple Hook
 *
 * Hooks for managing multiple/sortable array fields.
 *
 * useMultipleRows is the rendering hook: FormContext data is the single
 * source of truth and row keys are DERIVED from it. Do NOT reintroduce a
 * local items[].value snapshot — a snapshot written back on add/remove/move
 * overwrites edits the user made through setValue (the original
 * "multiple edit loss" bug).
 *
 * useMultiple (legacy) is a generic standalone list-state hook kept for
 * backward compatibility. Do not use it to render multiple form groups.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { FormValue, UseMultipleReturn, MultipleItem } from '../types';
import { generateUniqueKey } from '../utils/path';
import { generateUniqid } from '../utils/dataAttributes';
import { useFormContext } from '../context/FormContext';

// ---------------------------------------------------------------------------
// useMultipleRows — derived multiple-row state (single source: FormContext)
// ---------------------------------------------------------------------------

/**
 * React state implements the legacy multiple-row behavior:
 *  - the multiple value lives in FormContext data as an object keyed by
 *    `__<13hex>__` unique keys (PHP uniqid row ids);
 *  - empty data still renders ONE blank placeholder row (PHP
 *    `[$parentId => null]`) whose key is NOT written into the data until
 *    the user edits or clicks a row button;
 *  - array data is normalized once (effect) into a keyed object using
 *    stable per-index keys, so row identity survives the conversion.
 */
export interface UseMultipleRowsOptions {
  /** Dot path of the multiple field inside the form data */
  path: string;
  /** Minimum number of rows (remove is a no-op at min) */
  min?: number;
  /** Maximum number of rows (add is a no-op at max) */
  max?: number;
  /** Value for a newly added row (default: null, like PHP) */
  defaultValue?: () => FormValue;
}

/**
 * Return value of {@link useMultipleRows} — the derived row list plus the
 * mutation helpers used to render and edit a multiple/sortable group.
 */
export interface UseMultipleRowsReturn {
  /** Row keys in render order (always at least one — the placeholder) */
  rowKeys: string[];
  /** Current value of a row (undefined for the unsaved placeholder row) */
  getRowValue: (key: string) => FormValue;
  /** Insert a new row after `afterKey` (append when omitted) */
  add: (afterKey?: string) => void;
  /** Remove a row (no-op below min) */
  remove: (key: string) => void;
  /** Move a row one position up */
  moveUp: (key: string) => void;
  /** Move a row one position down */
  moveDown: (key: string) => void;
  /** Whether another row may be added (row count is below `max`) */
  canAdd: boolean;
  /** Whether a row may be removed (row count is above `min`) */
  canRemove: boolean;
  /** Number of rows currently rendered (includes the placeholder) */
  length: number;
}

/**
 * Renders and edits a multiple/sortable group, deriving its row list directly
 * from FormContext data (the single source of truth — no local value
 * snapshot). Returns stable row keys plus add/remove/move helpers that commit
 * back into the form data, and renders one blank placeholder row when the
 * field is empty (matching the legacy Legacy `[$parentId => null]` behavior).
 */
export function useMultipleRows({
  path,
  min = 0,
  max = Infinity,
  defaultValue,
}: UseMultipleRowsOptions): UseMultipleRowsReturn {
  const { getValue, setValue } = useFormContext();

  const raw = getValue(path);

  // Stable placeholder key for the blank row rendered when data is empty.
  const placeholderKeyRef = useRef<string | null>(null);
  if (placeholderKeyRef.current === null) {
    placeholderKeyRef.current = generateUniqid();
  }
  const placeholderKey = placeholderKeyRef.current;

  // Stable keys for rows that arrived as a plain array (index -> key).
  const arrayKeysRef = useRef<string[]>([]);
  if (Array.isArray(raw)) {
    while (arrayKeysRef.current.length < raw.length) {
      arrayKeysRef.current.push(generateUniqid());
    }
  }

  const rowKeys = useMemo<string[]>(() => {
    if (Array.isArray(raw) && raw.length > 0) {
      return raw.map((_, i) => arrayKeysRef.current[i]!);
    }
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      const keys = Object.keys(raw as Record<string, FormValue>);
      if (keys.length > 0) return keys;
    }
    return [placeholderKey];
  }, [raw, placeholderKey]);

  // Normalize array data into a keyed object ONCE so row identity (names,
  // data-uniqid) is stable. Values are mapped 1:1 — never snapshot-restored.
  useEffect(() => {
    if (Array.isArray(raw) && raw.length > 0) {
      const keyed: Record<string, FormValue> = {};
      raw.forEach((value, i) => {
        keyed[arrayKeysRef.current[i]!] = value as FormValue;
      });
      setValue(path, keyed as FormValue);
    }
  }, [raw, path, setValue]);

  const getRowValue = useCallback(
    (key: string): FormValue => {
      if (Array.isArray(raw)) {
        const idx = arrayKeysRef.current.indexOf(key);
        return idx === -1 ? undefined : (raw[idx] as FormValue);
      }
      if (raw !== null && typeof raw === 'object') {
        return (raw as Record<string, FormValue>)[key];
      }
      return undefined;
    },
    [raw]
  );

  const newRowValue = useCallback((): FormValue => {
    return defaultValue ? defaultValue() : null;
  }, [defaultValue]);

  /**
   * Write the row list back into form data. Values are read from the
   * CURRENT data at commit time (never from a render-time snapshot).
   */
  const commit = useCallback(
    (keys: string[], freshKey?: string) => {
      const next: Record<string, FormValue> = {};
      for (const key of keys) {
        if (key === freshKey) {
          next[key] = newRowValue();
        } else {
          const existing = getRowValue(key);
          next[key] = existing === undefined ? newRowValue() : existing;
        }
      }
      setValue(path, next as FormValue);
    },
    [getRowValue, newRowValue, path, setValue]
  );

  const canAdd = rowKeys.length < max;
  const canRemove = rowKeys.length > min;

  const add = useCallback(
    (afterKey?: string) => {
      if (!canAdd) return;
      const freshKey = generateUniqid();
      const keys = [...rowKeys];
      const at = afterKey === undefined ? keys.length - 1 : keys.indexOf(afterKey);
      keys.splice((at === -1 ? keys.length - 1 : at) + 1, 0, freshKey);
      commit(keys, freshKey);
    },
    [canAdd, rowKeys, commit]
  );

  const remove = useCallback(
    (key: string) => {
      if (!canRemove) return;
      commit(rowKeys.filter((k) => k !== key));
    },
    [canRemove, rowKeys, commit]
  );

  const move = useCallback(
    (key: string, delta: number) => {
      const from = rowKeys.indexOf(key);
      const to = from + delta;
      if (from === -1 || to < 0 || to >= rowKeys.length) return;
      const keys = [...rowKeys];
      keys.splice(from, 1);
      keys.splice(to, 0, key);
      commit(keys);
    },
    [rowKeys, commit]
  );

  const moveUp = useCallback((key: string) => move(key, -1), [move]);
  const moveDown = useCallback((key: string) => move(key, 1), [move]);

  return {
    rowKeys,
    getRowValue,
    add,
    remove,
    moveUp,
    moveDown,
    canAdd,
    canRemove,
    length: rowKeys.length,
  };
}

// ---------------------------------------------------------------------------
// useMultiple — legacy generic list-state hook (not data-derived)
// ---------------------------------------------------------------------------

/**
 * useMultiple hook options
 */
interface UseMultipleOptions<T = FormValue> {
  /** Initial items */
  initialItems?: T[];
  /** Minimum number of items */
  min?: number;
  /** Maximum number of items */
  max?: number;
  /** Default value for new items */
  defaultValue?: T | (() => T);
  /** Callback when items change */
  onChange?: (items: MultipleItem<T>[]) => void;
}

/**
 * useMultiple hook
 *
 * @deprecated for form rendering — it keeps a local items[].value snapshot
 * that goes stale against FormContext data. Render multiple groups with
 * useMultipleRows instead. Kept as a generic standalone list-state utility.
 */
export function useMultiple<T = FormValue>({
  initialItems = [],
  min = 0,
  max = Infinity,
  defaultValue,
  onChange,
}: UseMultipleOptions<T> = {}): UseMultipleReturn<T> {
  /**
   * Initialize items with unique keys
   */
  const initializeItems = useCallback((items: T[]): MultipleItem<T>[] => {
    return items.map((value, index) => ({
      key: generateUniqueKey(),
      value,
      order: index,
    }));
  }, []);

  const [items, setItems] = useState<MultipleItem<T>[]>(() => initializeItems(initialItems));

  // Track if initial sync has been done
  const hasInitialSynced = useRef(false);

  // Sync items and form data on mount when initialItems has data
  useEffect(() => {
    if (!hasInitialSynced.current && initialItems.length > 0) {
      hasInitialSynced.current = true;
      const initialized = initializeItems(initialItems);
      setItems(initialized);
      // Trigger onChange to sync form data with unique keys
      onChange?.(initialized);
    }
  }, [initialItems, initializeItems, onChange]);

  /**
   * Get default value for new item
   */
  const getDefaultValue = useCallback((): T => {
    if (typeof defaultValue === 'function') {
      return (defaultValue as () => T)();
    }
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    return {} as T;
  }, [defaultValue]);

  /**
   * Update items and trigger onChange
   */
  const updateItems = useCallback(
    (newItems: MultipleItem<T>[]) => {
      // Reorder items
      const reordered = newItems.map((item, index) => ({
        ...item,
        order: index,
      }));
      setItems(reordered);
      onChange?.(reordered);
    },
    [onChange]
  );

  /**
   * Check if can add more items
   */
  const canAdd = useMemo(() => {
    return items.length < max;
  }, [items.length, max]);

  /**
   * Check if can remove items
   */
  const canRemove = useMemo(() => {
    return items.length > min;
  }, [items.length, min]);

  /**
   * Add new item at specific index (or at end if no index provided)
   */
  const add = useCallback(
    (indexOrValue?: number | T, value?: T) => {
      if (!canAdd) return;

      // Determine index and value based on arguments
      let insertIndex = items.length;
      let itemValue = getDefaultValue();

      if (typeof indexOrValue === 'number') {
        insertIndex = indexOrValue;
        if (value !== undefined) {
          itemValue = value;
        }
      } else if (indexOrValue !== undefined) {
        itemValue = indexOrValue;
      }

      const newItem: MultipleItem<T> = {
        key: generateUniqueKey(),
        value: itemValue,
        order: insertIndex,
      };

      const newItems = [...items];
      newItems.splice(insertIndex, 0, newItem);
      updateItems(newItems);
    },
    [items, canAdd, getDefaultValue, updateItems]
  );

  /**
   * Remove item by key
   */
  const remove = useCallback(
    (key: string) => {
      if (!canRemove) return;

      const newItems = items.filter((item) => item.key !== key);
      updateItems(newItems);
    },
    [items, canRemove, updateItems]
  );

  /**
   * Move item to new index
   */
  const move = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex < 0 || fromIndex >= items.length) return;
      if (toIndex < 0 || toIndex >= items.length) return;
      if (fromIndex === toIndex) return;

      const newItems = [...items];
      const [movedItem] = newItems.splice(fromIndex, 1);
      if (movedItem) {
        newItems.splice(toIndex, 0, movedItem);
        updateItems(newItems);
      }
    },
    [items, updateItems]
  );

  /**
   * Swap two items
   */
  const swap = useCallback(
    (indexA: number, indexB: number) => {
      if (indexA < 0 || indexA >= items.length) return;
      if (indexB < 0 || indexB >= items.length) return;
      if (indexA === indexB) return;

      const newItems = [...items];
      const temp = newItems[indexA];
      newItems[indexA] = newItems[indexB]!;
      newItems[indexB] = temp!;
      updateItems(newItems);
    },
    [items, updateItems]
  );

  /**
   * Update item value
   */
  const update = useCallback(
    (key: string, value: T) => {
      const newItems = items.map((item) => (item.key === key ? { ...item, value } : item));
      updateItems(newItems);
    },
    [items, updateItems]
  );

  /**
   * Clear all items
   */
  const clear = useCallback(() => {
    // Keep minimum required items
    if (min > 0) {
      const minItems: MultipleItem<T>[] = [];
      for (let i = 0; i < min; i++) {
        minItems.push({
          key: generateUniqueKey(),
          value: getDefaultValue(),
          order: i,
        });
      }
      updateItems(minItems);
    } else {
      updateItems([]);
    }
  }, [min, getDefaultValue, updateItems]);

  /**
   * Reset to initial items or provided items
   */
  const reset = useCallback(
    (newItems?: T[]) => {
      const itemsToUse = newItems ?? initialItems;
      updateItems(initializeItems(itemsToUse));
    },
    [initialItems, initializeItems, updateItems]
  );

  /**
   * Get item by key
   */
  const getItem = useCallback(
    (key: string): MultipleItem<T> | undefined => {
      return items.find((item) => item.key === key);
    },
    [items]
  );

  return {
    items,
    add,
    remove,
    move,
    swap,
    update,
    clear,
    reset,
    getItem,
    length: items.length,
    canAdd,
    canRemove,
  };
}

/**
 * Convert array data with unique keys to indexed array for submission
 */
export function multipleItemsToArray<T>(items: MultipleItem<T>[]): T[] {
  return items.sort((a, b) => a.order - b.order).map((item) => item.value);
}

/**
 * Convert indexed array to items with unique keys
 */
export function arrayToMultipleItems<T>(array: T[]): MultipleItem<T>[] {
  return array.map((value, index) => ({
    key: generateUniqueKey(),
    value,
    order: index,
  }));
}

export default useMultiple;
