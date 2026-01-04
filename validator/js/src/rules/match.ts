/**
 * Pattern match validation rule
 *
 * Validates that a value matches a regular expression pattern
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';

/**
 * Pattern cache for compiled regular expressions
 */
const patternCache = new Map<string, RegExp>();

/**
 * Get or create a RegExp from a pattern string
 */
export function getPattern(pattern: string): RegExp | null {
  try {
    const cached = patternCache.get(pattern);
    if (cached) {
      return cached;
    }

    const regex = new RegExp(pattern);
    patternCache.set(pattern, regex);
    return regex;
  } catch {
    return null;
  }
}

/**
 * Match rule definition
 */
export const matchRule: RuleDefinition = {
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

    // Get pattern string
    let pattern: string;
    if (typeof ruleParam === 'string') {
      pattern = ruleParam;
    } else if (ruleParam instanceof RegExp) {
      pattern = ruleParam.source;
    } else {
      return null;
    }

    // Get or create RegExp
    const regex = getPattern(pattern);
    if (!regex) {
      // Invalid pattern, skip validation
      return null;
    }

    // Convert value to string for matching
    const strValue = String(value);

    if (!regex.test(strValue)) {
      return messages?.match ?? 'Please enter a value in the correct format.';
    }

    return null;
  },

  defaultMessage: 'Please enter a value in the correct format.',
};

export default matchRule;
