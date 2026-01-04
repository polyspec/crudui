/**
 * Required validation rule
 *
 * Validates that a field has a value (not empty, null, or undefined)
 */

import { RuleDefinition, ValidationContext } from '../types';

/**
 * Check if a value is considered empty
 */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim() === '';
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (typeof value === 'object') {
    return Object.keys(value).length === 0;
  }

  // Numbers, booleans are not empty (including 0 and false)
  return false;
}

/**
 * Required rule definition
 */
export const requiredRule: RuleDefinition = {
  validate(context: ValidationContext): string | null {
    const { value, ruleParam, messages } = context;

    // If rule is disabled (false), skip validation
    if (ruleParam === false) {
      return null;
    }

    // If rule is a condition expression, it should have been evaluated
    // before calling this function. The ruleParam should be true/false.
    if (ruleParam !== true) {
      return null;
    }

    // Check if value is empty
    if (isEmpty(value)) {
      return messages?.required ?? 'This field is required.';
    }

    return null;
  },

  defaultMessage: 'This field is required.',
};

export default requiredRule;
