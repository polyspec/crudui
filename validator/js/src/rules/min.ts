/**
 * Minimum value validation rule
 *
 * Validates that a numeric value is at least the specified minimum
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';

/**
 * Convert value to number for comparison
 * Returns null for strings that aren't valid complete numbers (e.g., "12abc")
 * Allows Infinity/-Infinity for proper min/max comparison
 */
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return isNaN(value) ? null : value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return null;
    }
    // Allow Infinity/-Infinity strings
    if (trimmed === 'Infinity' || trimmed === '-Infinity') {
      return parseFloat(trimmed);
    }
    // Validate string is a proper number format (not partial like "12abc")
    const numberPattern = /^[-+]?(\d+\.?\d*|\d*\.?\d+)$/;
    if (!numberPattern.test(trimmed)) {
      return null;
    }
    const num = parseFloat(trimmed);
    return isNaN(num) ? null : num;
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
      const message = messages?.min ?? `Please enter a value of at least ${minValue}.`;
      return message.replace('{0}', String(minValue));
    }

    return null;
  },

  defaultMessage: 'Please enter a value of at least {0}.',
};

export default minRule;
