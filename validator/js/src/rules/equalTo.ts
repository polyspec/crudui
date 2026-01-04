/**
 * Equal To validation rule
 *
 * Validates that a value matches another field's value
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';

/**
 * Get value from form data by path
 */
export function getValueByPath(data: Record<string, unknown>, path: string): unknown {
  const segments = path.replace(/^\.*/, '').split('.');
  let current: unknown = data;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

/**
 * Equal To rule definition
 */
export const equalToRule: RuleDefinition = {
  validate(context: ValidationContext): string | null {
    const { value, ruleParam, messages, allData, pathSegments } = context;

    // Skip if no rule param
    if (ruleParam === null || ruleParam === undefined) {
      return null;
    }

    // Skip validation if value is empty (required rule handles this)
    if (isEmpty(value)) {
      return null;
    }

    // Get the target field path
    let targetPath = String(ruleParam);

    // Handle relative paths
    if (targetPath.startsWith('.')) {
      // Relative path - resolve from current field's parent
      const parentPath = pathSegments.slice(0, -1);
      const relativeParts = targetPath.split('.');

      for (const part of relativeParts) {
        if (part === '') {
          // Each leading dot means go up one level
          if (parentPath.length > 0) {
            parentPath.pop();
          }
        } else {
          parentPath.push(part);
        }
      }
      targetPath = parentPath.join('.');
    }

    // Get the target field's value
    const targetValue = getValueByPath(allData, targetPath);

    // Compare values
    if (value !== targetValue) {
      return messages?.equalTo ?? 'Please enter the same value again.';
    }

    return null;
  },

  defaultMessage: 'Please enter the same value again.',
};

export default equalToRule;
