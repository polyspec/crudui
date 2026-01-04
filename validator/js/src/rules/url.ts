/**
 * URL validation rule
 *
 * Validates that a value is a valid URL
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';

/**
 * URL pattern for validation
 * Supports http, https, ftp protocols
 */
const URL_PATTERN = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i;

/**
 * Check if a value is a valid URL
 */
export function isValidUrl(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return false;
  }

  // Try using URL constructor if available (modern browsers)
  try {
    const url = new URL(trimmed);
    return ['http:', 'https:', 'ftp:'].includes(url.protocol);
  } catch {
    // Fall back to regex validation
    return URL_PATTERN.test(trimmed);
  }
}

/**
 * URL rule definition
 */
export const urlRule: RuleDefinition = {
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

    if (!isValidUrl(value)) {
      return messages?.url ?? 'Please enter a valid URL.';
    }

    return null;
  },

  defaultMessage: 'Please enter a valid URL.',
};

export default urlRule;
