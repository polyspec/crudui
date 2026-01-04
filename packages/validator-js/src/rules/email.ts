/**
 * Email validation rule
 *
 * Validates that a field contains a valid email address
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';

/**
 * Email regex pattern based on RFC 5322
 * This is a simplified pattern that covers most valid email formats
 */
const EMAIL_PATTERN =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * Check if a value is a valid email address
 */
export function isValidEmail(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  // First check the basic pattern
  if (!EMAIL_PATTERN.test(value)) {
    return false;
  }

  // Extract local part (before @)
  const atIndex = value.indexOf('@');
  const localPart = value.substring(0, atIndex);

  // Reject if local part starts with a dot
  if (localPart.startsWith('.')) {
    return false;
  }

  // Reject if local part ends with a dot
  if (localPart.endsWith('.')) {
    return false;
  }

  // Reject if local part has consecutive dots
  if (localPart.includes('..')) {
    return false;
  }

  return true;
}

/**
 * Email rule definition
 */
export const emailRule: RuleDefinition = {
  validate(context: ValidationContext): string | null {
    const { value, ruleParam, messages } = context;

    // If rule is disabled, skip validation
    if (ruleParam !== true) {
      return null;
    }

    // Skip validation if value is empty (required rule handles this)
    if (isEmpty(value)) {
      return null;
    }

    // Check if value is a valid email
    if (!isValidEmail(value)) {
      return messages?.email ?? 'Please enter a valid email address.';
    }

    return null;
  },

  defaultMessage: 'Please enter a valid email address.',
};

export default emailRule;
