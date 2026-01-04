/**
 * Date validation rule
 *
 * Validates that a value is a valid date
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';

/**
 * Check if a value is a valid date
 */
export function isValidDate(value: unknown): boolean {
  if (value instanceof Date) {
    return !isNaN(value.getTime());
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return false;
    }

    // Try to parse the date
    const date = new Date(trimmed);
    if (isNaN(date.getTime())) {
      return false;
    }

    // Additional validation for common formats
    // MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, etc.
    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}$/,                     // YYYY-MM-DD
      /^\d{2}\/\d{2}\/\d{4}$/,                   // MM/DD/YYYY or DD/MM/YYYY
      /^\d{2}-\d{2}-\d{4}$/,                     // MM-DD-YYYY or DD-MM-YYYY
      /^\d{4}\/\d{2}\/\d{2}$/,                   // YYYY/MM/DD
      /^\d{1,2}\s+\w+\s+\d{4}$/,                 // D Month YYYY
      /^\w+\s+\d{1,2},?\s+\d{4}$/,               // Month D, YYYY
    ];

    const matchesPattern = datePatterns.some(pattern => pattern.test(trimmed));

    // If it matches a pattern, validate further
    if (matchesPattern) {
      return true;
    }

    // For other formats, just check if Date constructor accepts it
    return true;
  }

  if (typeof value === 'number') {
    // Unix timestamp
    const date = new Date(value);
    return !isNaN(date.getTime());
  }

  return false;
}

/**
 * Parse a date value to Date object
 */
export function parseDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return null;
    }
    const date = new Date(trimmed);
    return isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  return null;
}

/**
 * Date rule definition
 */
export const dateRule: RuleDefinition = {
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

    if (!isValidDate(value)) {
      return messages?.date ?? 'Please enter a valid date.';
    }

    return null;
  },

  defaultMessage: 'Please enter a valid date.',
};

export default dateRule;
