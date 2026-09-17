/**
 * Minimum length validation rule
 *
 * The canonical text of the value has at least the given number of code points
 * (validation-rules.md, "Values"). An array or object value fails.
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';
import { codePointLength, formatMessage, isLengthLimit } from '../values/index';

/**
 * Minlength rule definition
 */
export const minlengthRule: RuleDefinition = {
  validate(context: ValidationContext): string | null {
    const { value, ruleParam, messages } = context;

    // A false or null parameter disables the rule.
    if (ruleParam === false || ruleParam === null || ruleParam === undefined) {
      return null;
    }
    if (!isLengthLimit(ruleParam)) {
      throw new TypeError('Invalid minlength parameter: expected an integer from 0 to 9007199254740991');
    }

    // An empty value passes without evaluation (required handles it).
    if (isEmpty(value)) {
      return null;
    }

    const length = codePointLength(value);
    if (length === undefined || length < ruleParam) {
      const message =
        messages?.minlength ?? 'Please enter at least {0} characters.';
      return formatMessage(message, ruleParam);
    }

    return null;
  },
};
