/**
 * Step validation rule
 *
 * Validates that a numeric value is a multiple of the specified step
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';
import { toNumber } from './min';

/**
 * Check if a value is a valid step of the base
 * Handles floating point precision issues
 */
export function isValidStep(value: number, step: number, base: number = 0): boolean {
  if (step === 0) {
    return true; // No step constraint
  }

  // Handle floating point precision by working with integers
  const decimalPlaces = Math.max(
    getDecimalPlaces(value),
    getDecimalPlaces(step),
    getDecimalPlaces(base)
  );

  const multiplier = Math.pow(10, decimalPlaces);
  const intValue = Math.round((value - base) * multiplier);
  const intStep = Math.round(step * multiplier);

  return intValue % intStep === 0;
}

/**
 * Get the number of decimal places in a number
 */
function getDecimalPlaces(num: number): number {
  const str = String(num);
  const decimalIndex = str.indexOf('.');
  if (decimalIndex === -1) {
    return 0;
  }
  return str.length - decimalIndex - 1;
}

/**
 * Step rule definition
 */
export const stepRule: RuleDefinition = {
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

    const step = Number(ruleParam);
    if (isNaN(step) || step <= 0) {
      return null;
    }

    const numValue = toNumber(value);
    if (numValue === null) {
      return null; // Not a valid number, skip validation
    }

    if (!isValidStep(numValue, step)) {
      const message = messages?.step ?? `Please enter a value that is a multiple of ${step}.`;
      return message.replace('{0}', String(step));
    }

    return null;
  },

  defaultMessage: 'Please enter a value that is a multiple of {0}.',
};

export default stepRule;
