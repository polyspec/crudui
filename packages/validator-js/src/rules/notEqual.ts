/**
 * Not Equal validation rule
 *
 * Validates that a value is different from a specified value or another field's value
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';
import { getValueByPath } from './equalTo';

/**
 * Not Equal rule definition
 */
export const notEqualRule: RuleDefinition = {
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

    let compareValue: unknown;

    // Check if ruleParam is a field path (starts with .)
    if (typeof ruleParam === 'string' && ruleParam.startsWith('.')) {
      // Relative path - resolve from current field's parent
      let targetPath = ruleParam;
      const parentPath = pathSegments.slice(0, -1);
      const relativeParts = targetPath.split('.');

      for (const part of relativeParts) {
        if (part === '') {
          if (parentPath.length > 0) {
            parentPath.pop();
          }
        } else {
          parentPath.push(part);
        }
      }
      targetPath = parentPath.join('.');
      compareValue = getValueByPath(allData, targetPath);
    } else {
      // Direct value comparison
      compareValue = ruleParam;
    }

    // Compare values
    if (value === compareValue) {
      return messages?.notEqual ?? 'Please enter a different value.';
    }

    return null;
  },

  defaultMessage: 'Please enter a different value.',
};

export default notEqualRule;
