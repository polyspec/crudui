/**
 * Range length validation rule
 *
 * The canonical text of the value has between minimum and maximum code points
 * (validation-rules.md, "Values"). An array or object value fails.
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';
import { codePointLength, formatMessage, isLengthRange } from '../values/index';

/**
 * Range length rule definition
 */
export const rangelengthRule: RuleDefinition = {
  validate(context: ValidationContext): string | null {
    const { value, ruleParam, messages } = context;

    // A false or null parameter disables the rule.
    if (ruleParam === false || ruleParam === null || ruleParam === undefined) {
      return null;
    }
    if (!isLengthRange(ruleParam)) {
      throw new TypeError(
        'Invalid rangelength parameter: expected [minimum, maximum] integers with minimum not above maximum'
      );
    }

    // An empty value passes without evaluation (required handles it).
    if (isEmpty(value)) {
      return null;
    }

    const [minLength, maxLength] = ruleParam;
    const length = codePointLength(value);
    if (length === undefined || length < minLength || length > maxLength) {
      const message = messages?.rangelength ?? 'Please enter a value between {0} and {1} characters.';
      return formatMessage(message, minLength, maxLength);
    }

    return null;
  },
};
