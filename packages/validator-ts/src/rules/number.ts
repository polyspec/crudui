/**
 * Number validation rule
 *
 * Validates that a value is a valid number (integer or decimal)
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';
import { trim } from '../values/index';

/**
 * Check if a value is a valid number.
 * Validation semantics principle: an input value must be a finite real number.
 * "Infinity"/"-Infinity"/"NaN" are rejected (number error). This is the input
 * value check does not change min/max threshold parameter handling.
 */
export function isValidNumber(value: unknown): boolean {
  if (typeof value === 'number') {
    return isFinite(value);
  }

  if (typeof value === 'string') {
    const trimmed = trim(value);
    if (trimmed === '') {
      return false;
    }
    // Allow optional sign, digits, optional decimal point, optional digits.
    // "Infinity"/"-Infinity"/"NaN" do not match this pattern, so they are
    // rejected as input values (finite-number principle).
    const numberPattern = /^[-+]?(\d+\.?\d*|\d*\.?\d+)$/;
    if (!numberPattern.test(trimmed)) {
      return false;
    }
    const num = parseFloat(trimmed);
    return isFinite(num);
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
};
