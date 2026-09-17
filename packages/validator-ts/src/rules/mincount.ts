/**
 * Min Count validation rule
 *
 * The count of the value (validation-rules.md, "Numbers") is at least the limit.
 * Unlike most rules, it evaluates empty values: an empty or missing collection
 * counts 0.
 */

import { RuleDefinition, ValidationContext } from '../types';
import { countOf, formatMessage, isLengthLimit } from '../values/index';

/**
 * Min Count rule definition
 */
export const mincountRule: RuleDefinition = {
  validate(context: ValidationContext): string | null {
    const { value, ruleParam, messages } = context;

    // A false or null parameter disables the rule.
    if (ruleParam === false || ruleParam === null || ruleParam === undefined) {
      return null;
    }
    if (!isLengthLimit(ruleParam)) {
      throw new TypeError('Invalid mincount parameter: expected an integer from 0 to 9007199254740991');
    }

    if (countOf(value) < ruleParam) {
      return formatMessage(messages?.mincount ?? 'Please select at least {0} items.', ruleParam);
    }

    return null;
  },
};
