/**
 * Number validation rule
 *
 * Validates that a value is a valid number (integer or decimal)
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';

/**
 * Check if a value is a valid number
 * Accepts Infinity/-Infinity as valid numbers for proper min/max validation
 */
export function isValidNumber(value: unknown): boolean {
  if (typeof value === 'number') {
    return !isNaN(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return false;
    }
    // Allow Infinity/-Infinity strings
    if (trimmed === 'Infinity' || trimmed === '-Infinity') {
      return true;
    }
    // Allow optional sign, digits, optional decimal point, optional digits
    const numberPattern = /^[-+]?(\d+\.?\d*|\d*\.?\d+)$/;
    if (!numberPattern.test(trimmed)) {
      return false;
    }
    const num = parseFloat(trimmed);
    return !isNaN(num);
  }

  return false;
}

/**
 * Number rule definition
 */
export const numberRule: RuleDefinition = {
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

    if (!isValidNumber(value)) {
      return messages?.number ?? 'Please enter a valid number.';
    }

    return null;
  },

  defaultMessage: 'Please enter a valid number.',
};

export default numberRule;
