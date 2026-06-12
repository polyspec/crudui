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
 * Anchor a pattern to full-string match (^...$), mirroring legacy.
 * legacy client dist.validate.js:1652-1657 and legacy server
 * Validation.php:126 ('~^'.$param.'$~') both force full match.
 * Do NOT double-anchor: if the pattern already starts with ^ or ends with $,
 * leave that side alone (PHP Pattern.php:35-40 str_starts_with/str_ends_with).
 */
export function anchorPattern(pattern: string): string {
  let anchored = pattern;
  if (!anchored.startsWith('^')) {
    anchored = '^' + anchored;
  }
  if (!anchored.endsWith('$')) {
    anchored = anchored + '$';
  }
  return anchored;
}

/**
 * Get or create a RegExp from a pattern string.
 * The pattern is anchored to full-string match before compilation.
 * The cache key is the anchored source so it reflects the anchoring.
 */
export function getPattern(pattern: string): RegExp | null {
  try {
    const anchored = anchorPattern(pattern);

    const cached = patternCache.get(anchored);
    if (cached) {
      return cached;
    }

    const regex = new RegExp(anchored);
    patternCache.set(anchored, regex);
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
    const { value, ruleParam, messages, ruleName } = context;

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
      // Look up the message under the invoked rule name first
      // ('pattern' is an alias of 'match'), then fall back
      const named =
        ruleName !== undefined ? messages?.[ruleName] : undefined;
      return (
        named ??
        messages?.pattern ??
        messages?.match ??
        'Please enter a valid format.'
      );
    }

    return null;
  },

  defaultMessage: 'Please enter a valid format.',
};

export default matchRule;
