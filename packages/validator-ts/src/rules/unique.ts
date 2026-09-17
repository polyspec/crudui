/**
 * Unique validation rule
 *
 * Validates that all values in an array are unique.
 *
 * Two invocation modes:
 * 1. Array-level: the field value itself is an array (e.g., multiple text
 *    field) - all non-empty elements must be unique.
 * 2. Item-level: the field is a scalar inside a repeated group (array index
 *    or __xxxx__ unique-key parent) - the value must not duplicate the same
 *    field of any EARLIER sibling item. The error is therefore reported on
 *    the later (duplicate) item, matching fixture expectations
 *    (e.g., field "items.1.code").
 *
 * A string param that is a condition expression acts as a filter: only items
 * for which the condition holds participate in the uniqueness check.
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';
import {
  getValueByPath,
  parsePathString,
  evaluateCondition,
} from '../parser/PathResolver';
import { parseCondition, isConditionExpression } from '../parser/ConditionParser';

/**
 * Build a comparison key for uniqueness checks
 */
function comparisonKey(value: unknown): unknown {
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  return value;
}

/**
 * Check if all values in array are unique
 */
export function areAllUnique(values: unknown[]): boolean {
  const seen = new Set<unknown>();

  for (const value of values) {
    const key = comparisonKey(value);
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
function extractFieldValues(items: unknown[], fieldName: string): unknown[] {
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
 * Evaluate a filter condition for a sibling item.
 * The condition is evaluated as if validating the same field on that item.
 */
function itemPassesCondition(
  condition: string,
  itemFieldPath: string[],
  allData: Record<string, unknown>
): boolean {
  try {
    const ast = parseCondition(condition);
    return evaluateCondition(
      ast,
      { currentPath: itemFieldPath, formData: allData },
      'CURRENT'
    );
  } catch {
    return false;
  }
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

    const isFilterCondition =
      typeof ruleParam === 'string' && isConditionExpression(ruleParam);

    const errorMessage = messages?.unique ?? 'Values must be unique.';

    if (Array.isArray(value) || (value !== null && typeof value === 'object')) {
      // Array-level validation: the field value is the array itself
      const entries = Object.entries(value);
      const elements = entries.map(([, element]) => element);
      let valuesToCheck: unknown[];

      if (isFilterCondition) {
        // Only elements whose item context passes the condition participate
        valuesToCheck = [];
        for (const [key, element] of entries) {
          const itemPath = [...pathSegments, key];
          if (!itemPassesCondition(ruleParam as string, itemPath, allData)) {
            continue;
          }
          if (!isEmpty(element)) {
            valuesToCheck.push(element);
          }
        }
      } else if (typeof ruleParam === 'string') {
        // Param is a field name within array items
        valuesToCheck = extractFieldValues(elements, ruleParam);
      } else {
        valuesToCheck = elements.filter((v) => !isEmpty(v));
      }

      if (valuesToCheck.length === 0) {
        return null;
      }

      if (!areAllUnique(valuesToCheck)) {
        return errorMessage;
      }

      return null;
    }

    // Item-level validation: scalar field inside a repeated group.
    // Parent layout: <containerPath>.<itemKey>.<fieldName>
    if (pathSegments.length < 2) {
      return null;
    }

    const fieldName = pathSegments[pathSegments.length - 1]!;
    const itemKey = pathSegments[pathSegments.length - 2]!;
    const containerPath = pathSegments.slice(0, -2);
    const container = getValueByPath(allData, containerPath);

    // Build ordered (key, item) entries for both array containers and
    // object containers with unique keys (__xxxx__ format)
    let entries: [string, unknown][];
    if (Array.isArray(container)) {
      if (!/^\d+$/.test(itemKey)) {
        return null;
      }
      entries = container.map((item, i) => [String(i), item]);
    } else if (container !== null && typeof container === 'object') {
      entries = Object.entries(container as Record<string, unknown>);
    } else {
      return null;
    }

    // Skip empty values (they never count as duplicates)
    if (isEmpty(value)) {
      return null;
    }

    // If a filter condition exists and the current item does not satisfy it,
    // the current item is excluded from the uniqueness check entirely
    if (
      isFilterCondition &&
      !itemPassesCondition(ruleParam as string, pathSegments, allData)
    ) {
      return null;
    }

    const currentKey = comparisonKey(value);

    for (const [key, item] of entries) {
      if (key === itemKey) {
        // Only compare against EARLIER siblings so the error lands on the
        // later (duplicate) item
        break;
      }

      if (typeof item !== 'object' || item === null) {
        continue;
      }

      if (isFilterCondition) {
        const siblingFieldPath = [...containerPath, key, fieldName];
        if (
          !itemPassesCondition(ruleParam as string, siblingFieldPath, allData)
        ) {
          continue;
        }
      }

      const siblingValue = (item as Record<string, unknown>)[fieldName];
      if (isEmpty(siblingValue)) {
        continue;
      }

      if (comparisonKey(siblingValue) === currentKey) {
        return errorMessage;
      }
    }

    return null;
  },
};
