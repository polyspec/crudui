/**
 * useMultiple Hook
 *
 * Hook for managing multiple/sortable array fields
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { FormValue, UseMultipleReturn, MultipleItem, UniqueKey } from '../types';
import { generateUniqueKey } from '../utils/path';

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
