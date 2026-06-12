/**
 * In list validation rule
 *
 * Validates that a value is one of the allowed values.
 * Ported from PHP validator-php Rules/In.php.
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';

/**
 * Flatten a nested array/string param into a flat list of allowed values
 */
export function flattenInValues(param: unknown): unknown[] {
  if (!Array.isArray(param)) {
    if (typeof param === 'string') {
      return param.split(',').map((v) => v.trim());
    }
    if (param !== null && typeof param === 'object') {
      // Object params (e.g., items maps) - use values, flattened
      return flattenInValues(Object.values(param));
    }
    return [param];
  }

  const result: unknown[] = [];
  for (const item of param) {
    if (Array.isArray(item) || (item !== null && typeof item === 'object')) {
      result.push(...flattenInValues(item));
    } else {
      result.push(item);
    }
  }
  return result;
}

/**
 * Normalize a value for comparison (PHP In::normalize parity)
 */
function normalize(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }
  return String(value).trim();
}

/**
 * Check if a value is in the allowed list (with loose comparison)
 */
export function isInList(value: unknown, allowedValues: unknown[]): boolean {
  const normalizedValue = normalize(value);

  for (const allowed of allowedValues) {
    const normalizedAllowed = normalize(allowed);

    // Strict string comparison after normalization
    if (normalizedValue === normalizedAllowed) {
      return true;
    }

    // Also try numeric comparison
    const numValue = Number(normalizedValue);
    const numAllowed = Number(normalizedAllowed);
    if (
      normalizedValue !== '' &&
      normalizedAllowed !== '' &&
      !isNaN(numValue) &&
      !isNaN(numAllowed) &&
      numValue === numAllowed
    ) {
      return true;
    }
  }

  return false;
}

/**
 * In rule definition
 */
export const inRule: RuleDefinition = {
  validate(context: ValidationContext): string | null {
    const { value, ruleParam, messages } = context;

    // Skip if rule is disabled or has no param
    if (ruleParam === false || ruleParam === null || ruleParam === undefined) {
      return null;
    }

    // Skip validation if value is empty (required rule handles this)
    if (isEmpty(value)) {
      return null;
    }

    const allowedValues = flattenInValues(ruleParam);
    if (allowedValues.length === 0) {
      return null;
    }

    const message = messages?.in ?? 'Please select a valid option.';

    // Handle array values (check that all items are in the allowed list)
    if (Array.isArray(value)) {
      for (const item of value) {
        if (!isInList(item, allowedValues)) {
          return message;
        }
      }
      return null;
    }

    if (!isInList(value, allowedValues)) {
      return message;
    }

    return null;
  },

  defaultMessage: 'Please select a valid option.',
};

export default inRule;
