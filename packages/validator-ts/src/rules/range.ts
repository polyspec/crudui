/**
 * Range validation rule
 *
 * A nonempty value passes when it is numeric and within the inclusive
 * `[minimum, maximum]` (validation-rules.md, "Numbers"). A value that is not
 * numeric fails.
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';
import { formatMessage, isNumberRange, numericValue } from '../values/index';

/** The parameter message of `range`. */
export const RANGE_PARAMETER_ERROR =
  'Invalid range parameter: expected [minimum, maximum] finite numbers with minimum not above maximum';

/**
 * Range rule definition
 */
export const rangeRule: RuleDefinition = {
  validate(context: ValidationContext): string | null {
    const { value, ruleParam, messages } = context;

    // A false or null parameter disables the rule.
    if (ruleParam === false || ruleParam === null || ruleParam === undefined) {
      return null;
    }
    if (!isNumberRange(ruleParam)) {
      throw new TypeError(RANGE_PARAMETER_ERROR);
    }

    // An empty value passes without evaluation (required handles it).
    if (isEmpty(value)) {
      return null;
    }

    const [minimum, maximum] = ruleParam;
    const number = numericValue(value);
    if (number === undefined || number < minimum || number > maximum) {
      return formatMessage(messages?.range ?? 'Please enter a value between {0} and {1}.', minimum, maximum);
    }

    return null;
  },
};
