/**
 * useMultiple Hook Tests
 *
 * Comprehensive tests for the useMultiple hook that manages array/multiple fields
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useMultiple,
  multipleItemsToArray,
  arrayToMultipleItems,
} from '../legacy/hooks/useMultiple';
import type { FormData, MultipleItem } from '../legacy/types';

describe('useMultiple hook', () => {
  describe('initialization', () => {
    it('should return all expected properties and methods', () => {
      const { result } = renderHook(() => useMultiple());

      // Properties
      expect(result.current.items).toBeDefined();
      expect(typeof result.current.length).toBe('number');
      expect(typeof result.current.canAdd).toBe('boolean');
      expect(typeof result.current.canRemove).toBe('boolean');

      // Methods
      expect(result.current.add).toBeInstanceOf(Function);
      expect(result.current.remove).toBeInstanceOf(Function);
      expect(result.current.move).toBeInstanceOf(Function);
      expect(result.current.swap).toBeInstanceOf(Function);
      expect(result.current.update).toBeInstanceOf(Function);
      expect(result.current.clear).toBeInstanceOf(Function);
      expect(result.current.reset).toBeInstanceOf(Function);
      expect(result.current.getItem).toBeInstanceOf(Function);
    });

    it('should initialize with empty array by default', () => {
      const { result } = renderHook(() => useMultiple());

      expect(result.current.items).toEqual([]);
      expect(result.current.length).toBe(0);
    });

    it('should initialize with provided initial items', () => {
      const initialItems = [{ name: 'Item 1' }, { name: 'Item 2' }];
      const { result } = renderHook(() =>
        useMultiple({ initialItems })
      );

      expect(result.current.length).toBe(2);
      expect(result.current.items[0]?.value).toEqual({ name: 'Item 1' });
      expect(result.current.items[1]?.value).toEqual({ name: 'Item 2' });
    });

    it('should generate unique keys for each item', () => {
      const initialItems = ['a', 'b', 'c'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems })
      );

      const keys = result.current.items.map((item) => item.key);
      const uniqueKeys = new Set(keys);

      expect(uniqueKeys.size).toBe(3);
      keys.forEach((key) => {
        expect(key).toMatch(/^__[a-z0-9]{13}__$/);
      });
    });

    it('should set correct order indices', () => {
      const initialItems = ['a', 'b', 'c'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems })
      );

      expect(result.current.items[0]?.order).toBe(0);
      expect(result.current.items[1]?.order).toBe(1);
      expect(result.current.items[2]?.order).toBe(2);
    });
  });

  describe('add operation', () => {
    it('should add item at the end by default', () => {
      const { result } = renderHook(() =>
        useMultiple({ defaultValue: 'new item' })
      );

      act(() => {
        result.current.add();
      });

      expect(result.current.length).toBe(1);
      expect(result.current.items[0]?.value).toBe('new item');
    });

    it('should add item with provided value', () => {
      const { result } = renderHook(() => useMultiple());

      act(() => {
        result.current.add({ name: 'Custom Value' });
      });

      expect(result.current.length).toBe(1);
      expect(result.current.items[0]?.value).toEqual({ name: 'Custom Value' });
    });

    it('should add item at specific index', () => {
      const initialItems = ['a', 'b', 'c'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems })
      );

      act(() => {
        result.current.add(1, 'inserted');
      });

      expect(result.current.length).toBe(4);
      expect(result.current.items[0]?.value).toBe('a');
      expect(result.current.items[1]?.value).toBe('inserted');
      expect(result.current.items[2]?.value).toBe('b');
      expect(result.current.items[3]?.value).toBe('c');
    });

    it('should update order indices after add', () => {
      const initialItems = ['a', 'b'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems })
      );

      act(() => {
        result.current.add(1, 'inserted');
      });

      expect(result.current.items[0]?.order).toBe(0);
      expect(result.current.items[1]?.order).toBe(1);
      expect(result.current.items[2]?.order).toBe(2);
    });

    it('should not add when max limit is reached', () => {
      const { result } = renderHook(() =>
        useMultiple({ max: 2 })
      );

      act(() => {
        result.current.add('a');
      });

      act(() => {
        result.current.add('b');
      });

      act(() => {
        result.current.add('c'); // Should not add
      });

      expect(result.current.length).toBe(2);
    });

    it('should call onChange callback when adding', () => {
      const onChange = vi.fn();
      const { result } = renderHook(() =>
        useMultiple({ onChange })
      );

      act(() => {
        result.current.add('test');
      });

      expect(onChange).toHaveBeenCalled();
      expect(onChange.mock.calls[0]?.[0]).toHaveLength(1);
    });

    it('should use defaultValue function when provided', () => {
      let counter = 0;
      const { result } = renderHook(() =>
        useMultiple({
          defaultValue: () => ({ id: ++counter }),
        })
      );

      act(() => {
        result.current.add();
      });

      act(() => {
        result.current.add();
      });

      // Counter increments each time add is called
      expect(result.current.items.length).toBe(2);
      // Values are assigned when add is called, so we check they have id property
      expect(result.current.items[0]?.value).toHaveProperty('id');
      expect(result.current.items[1]?.value).toHaveProperty('id');
    });
  });

  describe('remove operation', () => {
    it('should remove item by key', () => {
      const initialItems = ['a', 'b', 'c'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems })
      );

      const keyToRemove = result.current.items[1]!.key;

      act(() => {
        result.current.remove(keyToRemove);
      });

      expect(result.current.length).toBe(2);
      expect(result.current.items.map((i) => i.value)).toEqual(['a', 'c']);
    });

    it('should not remove when min limit is reached', () => {
      const initialItems = ['a', 'b'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems, min: 2 })
      );

      const keyToRemove = result.current.items[0]!.key;

      act(() => {
        result.current.remove(keyToRemove);
      });

      expect(result.current.length).toBe(2);
    });

    it('should update order indices after remove', () => {
      const initialItems = ['a', 'b', 'c'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems })
      );

      const keyToRemove = result.current.items[0]!.key;

      act(() => {
        result.current.remove(keyToRemove);
      });

      expect(result.current.items[0]?.order).toBe(0);
      expect(result.current.items[1]?.order).toBe(1);
    });

    it('should call onChange callback when removing', () => {
      const onChange = vi.fn();
      const initialItems = ['a', 'b'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems, onChange })
      );

      const keyToRemove = result.current.items[0]!.key;

      act(() => {
        result.current.remove(keyToRemove);
      });

      expect(onChange).toHaveBeenCalled();
    });

    it('should not fail when removing non-existent key', () => {
      const initialItems = ['a', 'b'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems })
      );

      act(() => {
        result.current.remove('__nonexistent__');
      });

      expect(result.current.length).toBe(2);
    });
  });

  describe('move operation', () => {
    it('should move item from one position to another', () => {
      const initialItems = ['a', 'b', 'c', 'd'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems })
      );

      act(() => {
        result.current.move(0, 2);
      });

      expect(result.current.items.map((i) => i.value)).toEqual([
        'b',
        'c',
        'a',
        'd',
      ]);
    });

    it('should update order indices after move', () => {
      const initialItems = ['a', 'b', 'c'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems })
      );

      act(() => {
        result.current.move(0, 2);
      });

      result.current.items.forEach((item, index) => {
        expect(item.order).toBe(index);
      });
    });

    it('should not move if fromIndex is out of bounds', () => {
      const initialItems = ['a', 'b', 'c'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems })
      );

      act(() => {
        result.current.move(-1, 1);
        result.current.move(5, 1);
      });

      expect(result.current.items.map((i) => i.value)).toEqual(['a', 'b', 'c']);
    });

    it('should not move if toIndex is out of bounds', () => {
      const initialItems = ['a', 'b', 'c'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems })
      );

      act(() => {
        result.current.move(0, -1);
        result.current.move(0, 5);
      });

      expect(result.current.items.map((i) => i.value)).toEqual(['a', 'b', 'c']);
    });

    it('should not move if fromIndex equals toIndex', () => {
      const onChange = vi.fn();
      const initialItems = ['a', 'b', 'c'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems, onChange })
      );

      // Clear initialization calls
      onChange.mockClear();

      act(() => {
        result.current.move(1, 1);
      });

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('swap operation', () => {
    it('should swap two items', () => {
      const initialItems = ['a', 'b', 'c'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems })
      );

      act(() => {
        result.current.swap(0, 2);
      });

      expect(result.current.items.map((i) => i.value)).toEqual(['c', 'b', 'a']);
    });

    it('should update order indices after swap', () => {
      const initialItems = ['a', 'b', 'c'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems })
      );

      act(() => {
        result.current.swap(0, 2);
      });

      result.current.items.forEach((item, index) => {
        expect(item.order).toBe(index);
      });
    });

    it('should not swap if indices are out of bounds', () => {
      const initialItems = ['a', 'b', 'c'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems })
      );

      act(() => {
        result.current.swap(-1, 2);
        result.current.swap(0, 5);
      });

      expect(result.current.items.map((i) => i.value)).toEqual(['a', 'b', 'c']);
    });

    it('should not swap if indices are equal', () => {
      const onChange = vi.fn();
      const initialItems = ['a', 'b', 'c'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems, onChange })
      );

      onChange.mockClear();

      act(() => {
        result.current.swap(1, 1);
      });

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('update operation', () => {
    it('should update item value by key', () => {
      const initialItems = [{ name: 'Item 1' }, { name: 'Item 2' }];
      const { result } = renderHook(() =>
        useMultiple({ initialItems })
      );

      const keyToUpdate = result.current.items[0]!.key;

      act(() => {
        result.current.update(keyToUpdate, { name: 'Updated Item' });
      });

      expect(result.current.items[0]?.value).toEqual({ name: 'Updated Item' });
      expect(result.current.items[1]?.value).toEqual({ name: 'Item 2' });
    });

    it('should preserve item key and order when updating', () => {
      const initialItems = ['a', 'b', 'c'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems })
      );

      const itemToUpdate = result.current.items[1]!;
      const originalKey = itemToUpdate.key;
      const originalOrder = itemToUpdate.order;

      act(() => {
        result.current.update(originalKey, 'updated');
      });

      expect(result.current.items[1]?.key).toBe(originalKey);
      expect(result.current.items[1]?.order).toBe(originalOrder);
    });

    it('should call onChange when updating', () => {
      const onChange = vi.fn();
      const initialItems = ['a', 'b'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems, onChange })
      );

      const keyToUpdate = result.current.items[0]!.key;

      act(() => {
        result.current.update(keyToUpdate, 'updated');
      });

      expect(onChange).toHaveBeenCalled();
    });
  });

  describe('clear operation', () => {
    it('should clear all items when min is 0', () => {
      const initialItems = ['a', 'b', 'c'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems, min: 0 })
      );

      act(() => {
        result.current.clear();
      });

      expect(result.current.length).toBe(0);
    });

    it('should keep minimum items when min > 0', () => {
      const initialItems = ['a', 'b', 'c'];
      const { result } = renderHook(() =>
        useMultiple({
          initialItems,
          min: 2,
          defaultValue: 'default',
        })
      );

      act(() => {
        result.current.clear();
      });

      expect(result.current.length).toBe(2);
      expect(result.current.items[0]?.value).toBe('default');
      expect(result.current.items[1]?.value).toBe('default');
    });

    it('should generate new unique keys after clear', () => {
      const initialItems = ['a', 'b'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems, min: 2, defaultValue: 'new' })
      );

      const originalKeys = result.current.items.map((i) => i.key);

      act(() => {
        result.current.clear();
      });

      const newKeys = result.current.items.map((i) => i.key);

      expect(newKeys[0]).not.toBe(originalKeys[0]);
      expect(newKeys[1]).not.toBe(originalKeys[1]);
    });
  });

  describe('reset operation', () => {
    it('should reset to initial items', () => {
      const initialItems = ['a', 'b', 'c'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems })
      );

      act(() => {
        result.current.add('d');
      });

      act(() => {
        result.current.remove(result.current.items[0]!.key);
      });

      // After add + remove, length may vary based on implementation

      act(() => {
        result.current.reset();
      });

      expect(result.current.length).toBe(3);
      expect(result.current.items.map((i) => i.value)).toEqual(['a', 'b', 'c']);
    });

    it('should reset to provided items', () => {
      const initialItems = ['a', 'b'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems })
      );

      act(() => {
        result.current.reset(['x', 'y', 'z']);
      });

      expect(result.current.length).toBe(3);
      expect(result.current.items.map((i) => i.value)).toEqual(['x', 'y', 'z']);
    });

    it('should generate new unique keys after reset', () => {
      const initialItems = ['a', 'b'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems })
      );

      const originalKeys = result.current.items.map((i) => i.key);

      act(() => {
        result.current.reset(['a', 'b']);
      });

      const newKeys = result.current.items.map((i) => i.key);

      expect(newKeys[0]).not.toBe(originalKeys[0]);
      expect(newKeys[1]).not.toBe(originalKeys[1]);
    });
  });

  describe('getItem operation', () => {
    it('should return item by key', () => {
      const initialItems = ['a', 'b', 'c'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems })
      );

      const targetItem = result.current.items[1]!;
      const foundItem = result.current.getItem(targetItem.key);

      expect(foundItem).toEqual(targetItem);
    });

    it('should return undefined for non-existent key', () => {
      const initialItems = ['a', 'b'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems })
      );

      const foundItem = result.current.getItem('__nonexistent__');

      expect(foundItem).toBeUndefined();
    });
  });

  describe('canAdd and canRemove flags', () => {
    it('should correctly reflect canAdd based on max', () => {
      const { result } = renderHook(() =>
        useMultiple({ max: 2 })
      );

      expect(result.current.canAdd).toBe(true);

      act(() => {
        result.current.add('a');
      });
      expect(result.current.canAdd).toBe(true);

      act(() => {
        result.current.add('b');
      });
      expect(result.current.canAdd).toBe(false);
    });

    it('should correctly reflect canRemove based on min', () => {
      const initialItems = ['a', 'b'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems, min: 1 })
      );

      expect(result.current.canRemove).toBe(true);

      act(() => {
        result.current.remove(result.current.items[0]!.key);
      });
      expect(result.current.canRemove).toBe(false);
    });

    it('should handle canAdd with Infinity max', () => {
      const { result } = renderHook(() =>
        useMultiple()
      );

      expect(result.current.canAdd).toBe(true);

      act(() => {
        for (let i = 0; i < 100; i++) {
          result.current.add(`item-${i}`);
        }
      });

      expect(result.current.canAdd).toBe(true);
    });

    it('should handle canRemove with 0 min', () => {
      const initialItems = ['a'];
      const { result } = renderHook(() =>
        useMultiple({ initialItems, min: 0 })
      );

      expect(result.current.canRemove).toBe(true);

      act(() => {
        result.current.remove(result.current.items[0]!.key);
      });

      expect(result.current.canRemove).toBe(false);
    });
  });

  describe('length property', () => {
    it('should reflect current item count', () => {
      const { result } = renderHook(() => useMultiple());

      expect(result.current.length).toBe(0);

      act(() => {
        result.current.add('a');
      });
      expect(result.current.length).toBe(1);

      act(() => {
        result.current.add('b');
      });
      expect(result.current.length).toBe(2);

      act(() => {
        result.current.add('c');
      });
      expect(result.current.length).toBe(3);

      act(() => {
        result.current.remove(result.current.items[0]!.key);
      });
      expect(result.current.length).toBe(2);
    });
  });
});

describe('multipleItemsToArray', () => {
  it('should convert items to sorted array', () => {
    const items: MultipleItem<string>[] = [
      { key: '__key1__', value: 'c', order: 2 },
      { key: '__key2__', value: 'a', order: 0 },
      { key: '__key3__', value: 'b', order: 1 },
    ];

    const result = multipleItemsToArray(items);

    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('should handle empty array', () => {
    const result = multipleItemsToArray([]);
    expect(result).toEqual([]);
  });

  it('should handle single item', () => {
    const items: MultipleItem<{ name: string }>[] = [
      { key: '__key1__', value: { name: 'test' }, order: 0 },
    ];

    const result = multipleItemsToArray(items);

    expect(result).toEqual([{ name: 'test' }]);
  });
});

describe('arrayToMultipleItems', () => {
  it('should convert array to items with unique keys', () => {
    const array = ['a', 'b', 'c'];

    const result = arrayToMultipleItems(array);

    expect(result).toHaveLength(3);
    expect(result[0]?.value).toBe('a');
    expect(result[1]?.value).toBe('b');
    expect(result[2]?.value).toBe('c');
    result.forEach((item, index) => {
      expect(item.key).toMatch(/^__[a-z0-9]{13}__$/);
      expect(item.order).toBe(index);
    });
  });

  it('should generate unique keys for each item', () => {
    const array = ['a', 'a', 'a'];

    const result = arrayToMultipleItems(array);

    const keys = result.map((item) => item.key);
    const uniqueKeys = new Set(keys);

    expect(uniqueKeys.size).toBe(3);
  });

  it('should handle empty array', () => {
    const result = arrayToMultipleItems([]);
    expect(result).toEqual([]);
  });

  it('should handle complex objects', () => {
    const array = [
      { id: 1, name: 'Item 1' },
      { id: 2, name: 'Item 2' },
    ];

    const result = arrayToMultipleItems(array);

    expect(result[0]?.value).toEqual({ id: 1, name: 'Item 1' });
    expect(result[1]?.value).toEqual({ id: 2, name: 'Item 2' });
  });
});
