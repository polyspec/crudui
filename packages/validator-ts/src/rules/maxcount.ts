/**
 * Max Count validation rule
 *
 * The count of the value (validation-rules.md, "Numbers") is at most the limit.
 * It evaluates empty values, which count 0.
 */

import { RuleDefinition, ValidationContext } from '../types';
import { countOf, formatMessage, isLengthLimit } from '../values/index';

/**
 * Max Count rule definition
 */
export const maxcountRule: RuleDefinition = {
  validate(context: ValidationContext): string | null {
    const { value, ruleParam, messages } = context;

    // A false or null parameter disables the rule.
    if (ruleParam === false || ruleParam === null || ruleParam === undefined) {
      return null;
    }
    if (!isLengthLimit(ruleParam)) {
      throw new TypeError('Invalid maxcount parameter: expected an integer from 0 to 9007199254740991');
    }

    if (countOf(value) > ruleParam) {
      return formatMessage(messages?.maxcount ?? 'Please select no more than {0} items.', ruleParam);
    }

    return null;
  },
};
