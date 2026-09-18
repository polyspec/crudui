/**
 * Unique rule performance test — verify linear time complexity.
 *
 * Tests that the item-level uniqueness check takes time linear in the number of
 * rows, not quadratic. The precomputation approach computes duplicates once per
 * validation run, making the entire collection check O(n) overall.
 */

import { describe, test, expect } from 'vitest';
import { validate } from '../validate/index';

describe('unique rule performance', () => {
  test('item-level check is linear: precomputation makes 4n items ~4x slower', () => {
    // Use sizes that each take 20-200ms for reliable measurement
    // With precomputation O(n): ratio should be ~4
    // With old quadratic approach O(n²): ratio would be ~16
    const sizes = [500, 2000];
    const times: number[] = [];

    for (const n of sizes) {
      // Create a form spec with a multiple group containing a unique field
      const spec = {
        type: 'group',
        properties: {
          items: {
            type: 'group',
            multiple: true,
            properties: {
              code: {
                type: 'text',
                validate: {
                  unique: true,
                },
              },
            },
          },
        },
      };

      // Create data with n unique items
      const items: Record<string, { code: string }> = {};
      for (let i = 0; i < n; i++) {
        const key = `__${String(i + 1).padStart(13, '0')}__`;
        items[key] = { code: `item-${i}` };
      }
      const data = { items };

      // Measure best of 3 runs
      let bestTime = Infinity;
      for (let run = 0; run < 3; run++) {
        const start = performance.now();
        const result = validate(spec, data);
        const elapsed = performance.now() - start;

        // Validation should pass (all codes are unique)
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);

        if (elapsed < bestTime) {
          bestTime = elapsed;
        }
      }

      times.push(bestTime);
    }

    // Calculate the ratio: time for 4n / time for n
    // With precomputation O(n): ratio should be ~4
    // With quadratic O(n²): ratio would be ~16
    const ratio = times[1]! / times[0]!;
    expect(ratio).toBeLessThan(8); // Assert linear behavior (4 is ideal, allow some overhead)
  });

  test('array-level check is linear', () => {
    // Array-level validation happens all at once, should be linear
    const sizes = [500, 2000];
    const times: number[] = [];

    for (const n of sizes) {
      // Form with a multiple scalar field
      const spec = {
        type: 'group',
        properties: {
          codes: {
            type: 'text',
            multiple: true,
            validate: {
              unique: true,
            },
          },
        },
      };

      // Create data with n unique values
      const codes: Record<string, string> = {};
      for (let i = 0; i < n; i++) {
        const key = `__${String(i + 1).padStart(13, '0')}__`;
        codes[key] = `item-${i}`;
      }
      const data = { codes };

      // Measure best of 3 runs
      let bestTime = Infinity;
      for (let run = 0; run < 3; run++) {
        const start = performance.now();
        const result = validate(spec, data);
        const elapsed = performance.now() - start;

        // Validation should pass (all codes are unique)
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);

        if (elapsed < bestTime) {
          bestTime = elapsed;
        }
      }

      times.push(bestTime);
    }

    // Array-level should be linear too
    const ratio = times[1]! / times[0]!;
    expect(ratio).toBeLessThan(8); // Assert linear behavior
  });
});
