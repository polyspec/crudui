/**
 * Min Count validation rule
 *
 * Validates that an array has at least the specified number of items
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';

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

    // Skip validation if value is empty (required rule handles this)
    if (isEmpty(value)) {
      return null;
    }

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
