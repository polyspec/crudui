/**
 * Min Count validation rule
 *
 * Validates that an array has at least the specified number of items
 */

import { RuleDefinition, ValidationContext } from '../types';

/**
 * Get array length from value
 */
export function getArrayLength(value: unknown): number {
  if (Array.isArray(value)) {
    return value.length;
  }

  // Handle FileList
  if (typeof FileList !== 'undefined' && value instanceof FileList) {
    return value.length;
  }

  // Handle object with length property
  if (typeof value === 'object' && value !== null && 'length' in value) {
    const len = (value as { length: unknown }).length;
    if (typeof len === 'number') {
      return len;
    }
  }

  // Object-key multiple group: data arrives as a plain object keyed by unique
  // ids (e.g. { __a__: {...}, __b__: {...} }) instead of an array. Count its
  // entries so mincount/maxcount see the repeated-group size. PHP counts assoc
  // arrays identically (Rules/MinCount.php count($value)).
  if (typeof value === 'object' && value !== null) {
    return Object.keys(value as Record<string, unknown>).length;
  }

  return 0;
}

/**
 * Min Count rule definition
 */
export const mincountRule: RuleDefinition = {
  validate(context: ValidationContext): string | null {
    const { value, ruleParam, messages } = context;

    // Skip if no rule param
    if (ruleParam === null || ruleParam === undefined) {
      return null;
    }

    // NOTE: unlike most rules, mincount does NOT skip empty values -
    // an empty array (count 0) must fail mincount >= 1 (fixture mincount-001)

    const minCount = Number(ruleParam);
    if (isNaN(minCount)) {
      return null;
    }

    const count = getArrayLength(value);

    if (count < minCount) {
      const message = messages?.mincount ?? `Please select at least ${minCount} items.`;
      return message.replace('{0}', String(minCount));
    }

    return null;
  },

  defaultMessage: 'Please select at least {0} items.',
};

export default mincountRule;
