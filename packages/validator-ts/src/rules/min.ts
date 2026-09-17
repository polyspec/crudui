/**
 * Minimum value validation rule
 *
 * Validates that a numeric value is at least the specified minimum
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';
import { trim } from '../values/index';

/**
 * Convert an input value to a number for comparison.
 * Returns null for strings that aren't valid complete numbers (e.g., "12abc").
 * Validation semantics principle: input values must be finite real numbers, so
 * "Infinity"/"-Infinity"/"NaN" return null (the number rule reports them). This
 * applies only to input values; min/max threshold parameters (Number(ruleParam)
 * in min/max rules) keep accepting Infinity.
 */
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = trim(value);
    if (trimmed === '') {
      return null;
    }
    // Validate string is a proper number format (not partial like "12abc").
    // "Infinity"/"-Infinity"/"NaN" do not match, so they convert to null.
    const numberPattern = /^[-+]?(\d+\.?\d*|\d*\.?\d+)$/;
    if (!numberPattern.test(trimmed)) {
      return null;
    }
    const num = parseFloat(trimmed);
    return isFinite(num) ? num : null;
  }

  return null;
}

/**
 * Min rule definition
 */
export const minRule: RuleDefinition = {
  validate(context: ValidationContext): string | null {
    const { value, ruleParam, messages } = context;

    // Skip if no rule param
    if (ruleParam === null || ruleParam === undefined) {
      return null;
    }

    // Skip validation if value is empty (required rule handles this)
    if (isEmpty(value)) {
      return null;
    }

    const minValue = Number(ruleParam);
    if (isNaN(minValue)) {
      return null;
    }

    const numValue = toNumber(value);
    // Skip if value cannot be converted to a number (number rule handles this)
    if (numValue === null) {
      return null;
    }

    if (numValue < minValue) {
      const message =
        messages?.min ?? 'Please enter a value greater than or equal to {0}.';
      return message.replace('{0}', String(minValue));
    }

    return null;
  },
};
