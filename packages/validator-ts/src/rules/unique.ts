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
 * Cache for precomputed duplicates per validation run.
 * Keyed by the allData object (the full form data for this validation).
 * Value: Map keyed by "containerPath:fieldName:filterParam" -> Map of itemKey -> true if duplicate.
 * This ensures duplicates are computed once per validation run for each field/filter combo.
 */
const duplicatesByRun = new WeakMap<
  Record<string, unknown>,
  Map<string, Map<string, boolean>>
>();

/**
 * The canonical key of a value for `unique` (docs/spec/validation-rules.md): equal keys mean the
 * same JSON value. Every value carries its type, strings are JSON-escaped, numbers are written by
 * their exact value, lists keep their order and object members are sorted by name at every depth,
 * so no encoding of one type can be read as another.
 */
function canonicalKey(value: unknown): string {
  if (value === null) return 'z';
  if (typeof value === 'boolean') return value ? 'b1' : 'b0';
  // String(-0) is "0", so -0 and 0 are the same number.
  if (typeof value === 'number') return `n${String(value)}`;
  if (typeof value === 'string') return `s${JSON.stringify(value)}`;
  if (Array.isArray(value)) return `a[${value.map(canonicalKey).join(',')}]`;
  if (typeof value === 'object') {
    const members = Object.keys(value as Record<string, unknown>).sort()
      .map(name => `${JSON.stringify(name)}:${canonicalKey((value as Record<string, unknown>)[name])}`);
    return `o{${members.join(',')}}`;
  }
  return `u${String(value)}`;
}

/**
 * Check if all values in array are unique
 */
export function areAllUnique(values: unknown[]): boolean {
  const seen = new Set<string>();

  for (const value of values) {
    const key = canonicalKey(value);
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
        // Only elements whose item context passes the condition participate.
        // Evaluate condition once per item.
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

    // Skip empty values (they never count as duplicates)
    if (isEmpty(value)) {
      return null;
    }

    // Evaluate filter condition for the current item once
    const currentItemPassesFilter = !isFilterCondition ||
      itemPassesCondition(ruleParam as string, pathSegments, allData);

    // If the current item doesn't pass the filter, it's excluded from the check
    if (!currentItemPassesFilter) {
      return null;
    }

    // Get or create the cache for this validation run
    let runCache = duplicatesByRun.get(allData as Record<string, unknown>);
    if (!runCache) {
      runCache = new Map();
      duplicatesByRun.set(allData as Record<string, unknown>, runCache);
    }

    // Create a unique key for this container field combination
    const containerPathStr = containerPath.join('.');
    const cacheKey = isFilterCondition
      ? `${containerPathStr}:${fieldName}:${ruleParam}`
      : `${containerPathStr}:${fieldName}`;

    // If we haven't precomputed duplicates for this field yet, do it now
    let duplicates = runCache.get(cacheKey);
    if (!duplicates) {
      duplicates = new Map<string, boolean>();
      runCache.set(cacheKey, duplicates);

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

      // Walk through all rows once and identify which ones are duplicates
      const seenKeys = new Set<string>();
      for (const [key, item] of entries) {
        if (typeof item !== 'object' || item === null) {
          continue;
        }

        // Evaluate filter condition once per row
        if (isFilterCondition) {
          const itemFieldPath = [...containerPath, key, fieldName];
          if (!itemPassesCondition(ruleParam as string, itemFieldPath, allData)) {
            continue;
          }
        }

        const itemValue = (item as Record<string, unknown>)[fieldName];
        if (isEmpty(itemValue)) {
          continue;
        }

        const itemValueKey = canonicalKey(itemValue);
        if (seenKeys.has(itemValueKey)) {
          // This row is a duplicate
          duplicates.set(key, true);
        } else {
          seenKeys.add(itemValueKey);
        }
      }
    }

    // Check precomputed result: is this item a duplicate?
    if (duplicates.get(itemKey)) {
      return errorMessage;
    }

    return null;
  },
};
