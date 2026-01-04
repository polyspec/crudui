/**
 * Unique validation rule
 *
 * Validates that all values in an array are unique
 * Can also check a specific field within array items
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';
import { getValueByPath, parsePathString } from '../parser/PathResolver';

/**
 * Check if all values in array are unique
 */
export function areAllUnique(values: unknown[]): boolean {
  const seen = new Set<unknown>();

  for (const value of values) {
    // Stringify objects for comparison
    const key =
      typeof value === 'object' && value !== null
        ? JSON.stringify(value)
        : value;

    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
  }

  return true;
}

/**
 * Extract values from array items by field name
 */
function extractFieldValues(
  items: unknown[],
  fieldName: string
): unknown[] {
  const values: unknown[] = [];

  for (const item of items) {
    if (typeof item === 'object' && item !== null) {
      const path = parsePathString(fieldName);
      const value = getValueByPath(item as Record<string, unknown>, path);
      // Only include non-empty values
      if (!isEmpty(value)) {
        values.push(value);
      }
    }
  }

  return values;
}

/**
 * Unique rule definition
 */
export const uniqueRule: RuleDefinition = {
  validate(context: ValidationContext): string | null {
    const { value, ruleParam, messages, allData, pathSegments } = context;

    // Skip if rule is disabled
    if (ruleParam === false || ruleParam === null || ruleParam === undefined) {
      return null;
    }

    // Determine the array to check
    let arrayToCheck: unknown[];
    let valuesToCheck: unknown[];

    if (Array.isArray(value)) {
      // Value is an array, check its elements
      arrayToCheck = value;

      if (typeof ruleParam === 'string') {
        // Check specific field within array items
        valuesToCheck = extractFieldValues(arrayToCheck, ruleParam);
      } else {
        // Check array elements directly
        valuesToCheck = arrayToCheck.filter((v) => !isEmpty(v));
      }
    } else {
      // Value is not an array, check if current field's value is unique
      // among sibling items in parent array
      const parentPath = pathSegments.slice(0, -1);
      const fieldName = pathSegments[pathSegments.length - 1];

      // Check if parent is an array index
      const parentIndex = parentPath[parentPath.length - 1];
      if (parentIndex === undefined || !/^\d+$/.test(parentIndex)) {
        return null;
      }

      // Get the array containing this item
      const arrayPath = parentPath.slice(0, -1);
      const parentArray = getValueByPath(allData, arrayPath);

      if (!Array.isArray(parentArray)) {
        return null;
      }

      arrayToCheck = parentArray;

      if (typeof ruleParam === 'string') {
        valuesToCheck = extractFieldValues(arrayToCheck, ruleParam);
      } else if (fieldName) {
        valuesToCheck = extractFieldValues(arrayToCheck, fieldName);
      } else {
        return null;
      }
    }

    // Skip if no values to check
    if (valuesToCheck.length === 0) {
      return null;
    }

    // Check uniqueness
    if (!areAllUnique(valuesToCheck)) {
      return messages?.unique ?? 'All values must be unique.';
    }

    return null;
  },

  defaultMessage: 'All values must be unique.',
};

export default uniqueRule;
