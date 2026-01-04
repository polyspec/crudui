/**
 * Digits validation rule
 *
 * Validates that a value contains only digits (integer only, no decimals)
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';

/**
 * Check if a value contains only digits
 */
export function isDigitsOnly(value: unknown): boolean {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return false;
    }
    // Only allow positive integers (no sign, no decimal)
    return /^\d+$/.test(trimmed);
  }

  return false;
}

/**
 * Digits rule definition
 */
export const digitsRule: RuleDefinition = {
  validate(context: ValidationContext): string | null {
    const { value, ruleParam, messages } = context;

    // Skip if rule is disabled
    if (ruleParam === false) {
      return null;
    }

    // Skip validation if value is empty (required rule handles this)
    if (isEmpty(value)) {
      return null;
    }

    if (!isDigitsOnly(value)) {
      return messages?.digits ?? 'Please enter only digits.';
    }

    return null;
  },

  defaultMessage: 'Please enter only digits.',
};

export default digitsRule;
