/**
 * Validation Rules Registry
 *
 * Central registry for all validation rules
 */

import { RuleDefinition, RuleFn } from '../types';
import { requiredRule } from './required';
import { emailRule } from './email';
import { minlengthRule } from './minlength';
import { maxlengthRule } from './maxlength';
import { minRule } from './min';
import { maxRule } from './max';
import { matchRule } from './match';
import { uniqueRule } from './unique';
import { rangeRule } from './range';
import { rangelengthRule } from './rangelength';
import { numberRule } from './number';
import { digitsRule } from './digits';
import { equalToRule } from './equalTo';
import { notEqualRule } from './notEqual';
import { dateRule } from './date';
import { dateISORule } from './dateISO';
import { enddateRule } from './enddate';
import { urlRule } from './url';
import { acceptRule } from './accept';
import { mincountRule } from './mincount';
import { maxcountRule } from './maxcount';
import { stepRule } from './step';

/**
 * Built-in validation rules registry
 */
const builtInRules: Map<string, RuleDefinition> = new Map([
  ['required', requiredRule],
  ['email', emailRule],
  ['minlength', minlengthRule],
  ['maxlength', maxlengthRule],
  ['min', minRule],
  ['max', maxRule],
  ['match', matchRule],
  ['unique', uniqueRule],
  ['range', rangeRule],
  ['rangelength', rangelengthRule],
  ['number', numberRule],
  ['digits', digitsRule],
  ['equalTo', equalToRule],
  ['notEqual', notEqualRule],
  ['date', dateRule],
  ['dateISO', dateISORule],
  ['enddate', enddateRule],
  ['url', urlRule],
  ['accept', acceptRule],
  ['mincount', mincountRule],
  ['maxcount', maxcountRule],
  ['step', stepRule],
]);

/**
 * Custom rules registry (user-defined)
 */
const customRules: Map<string, RuleDefinition> = new Map();

/**
 * Get a validation rule by name
 */
export function getRule(name: string): RuleDefinition | undefined {
  // Check custom rules first (allows overriding built-in rules)
  const custom = customRules.get(name);
  if (custom) {
    return custom;
  }

  return builtInRules.get(name);
}

/**
 * Register a custom validation rule
 */
export function registerRule(
  name: string,
  rule: RuleDefinition | RuleFn
): void {
  const definition: RuleDefinition =
    typeof rule === 'function'
      ? { validate: rule, defaultMessage: 'Validation failed.' }
      : rule;

  customRules.set(name, definition);
}

/**
 * Unregister a custom validation rule
 */
export function unregisterRule(name: string): boolean {
  return customRules.delete(name);
}

/**
 * Check if a rule exists
 */
export function hasRule(name: string): boolean {
  return customRules.has(name) || builtInRules.has(name);
}

/**
 * Get all registered rule names
 */
export function getRuleNames(): string[] {
  const names = new Set<string>();

  for (const name of builtInRules.keys()) {
    names.add(name);
  }

  for (const name of customRules.keys()) {
    names.add(name);
  }

  return Array.from(names);
}

/**
 * Clear all custom rules
 */
export function clearCustomRules(): void {
  customRules.clear();
}

// Export individual rules for direct use
export { requiredRule } from './required';
export { emailRule } from './email';
export { minlengthRule } from './minlength';
export { maxlengthRule } from './maxlength';
export { minRule } from './min';
export { maxRule } from './max';
export { matchRule } from './match';
export { uniqueRule } from './unique';
export { rangeRule } from './range';
export { rangelengthRule } from './rangelength';
export { numberRule } from './number';
export { digitsRule } from './digits';
export { equalToRule } from './equalTo';
export { notEqualRule } from './notEqual';
export { dateRule } from './date';
export { dateISORule } from './dateISO';
export { enddateRule } from './enddate';
export { urlRule } from './url';
export { acceptRule } from './accept';
export { mincountRule } from './mincount';
export { maxcountRule } from './maxcount';
export { stepRule } from './step';

// Export utility functions from rules
export { isEmpty } from './required';
export { isValidEmail } from './email';
export { getLength } from './minlength';
export { toNumber } from './min';
export { getPattern } from './match';
export { areAllUnique } from './unique';
export { isValidNumber } from './number';
export { isDigitsOnly } from './digits';
export { getValueByPath } from './equalTo';
export { isValidDate, parseDate } from './date';
export { isValidDateISO } from './dateISO';
export { isValidUrl } from './url';
export { parseAcceptParam, matchesMimeType, matchesExtension } from './accept';
export { getArrayLength } from './mincount';
export { isValidStep } from './step';
