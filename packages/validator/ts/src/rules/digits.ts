/**
 * Digits validation rule
 *
 * A nonempty string (trimmed) or number passes when its canonical text consists
 * only of ASCII digits (validation-rules.md, "Numbers"). Other values fail.
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';
import { isDigits } from '../values/index';

/** The parameter message of `digits`. */
export const DIGITS_PARAMETER_ERROR = 'Invalid digits parameter: expected true or false';

/**
 * Digits rule definition
 */
export const digitsRule: RuleDefinition = {
  validate(context: ValidationContext): string | null {
    const { value, ruleParam, messages } = context;

    // A false or null parameter disables the rule.
    if (ruleParam === false || ruleParam === null || ruleParam === undefined) {
      return null;
    }
    if (ruleParam !== true) {
      throw new TypeError(DIGITS_PARAMETER_ERROR);
    }

    // An empty value passes without evaluation (required handles it).
    if (isEmpty(value)) {
      return null;
    }

    if (!isDigits(value)) {
      return messages?.digits ?? 'Please enter only digits.';
    }

    return null;
  },
};
