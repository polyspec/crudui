/**
 * Validation Rules Registry
 *
 * Central registry for all validation rules
 */

import type { RuleDefinition } from '../types';
import { requiredRule } from './required';
import { emailRule } from './email';
import { minlengthRule } from './minlength';
import { maxlengthRule } from './maxlength';
import { minRule } from './min';
import { maxRule } from './max';
import { matchRule } from './match';
import { uniqueRule } from './unique';
import { inRule } from './in';
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
  // 'pattern' is an alias of 'match' (same implementation)
  ['pattern', matchRule],
  ['unique', uniqueRule],
  ['in', inRule],
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
 * Get a validation rule by name
 */
export function getRule(name: string): RuleDefinition | undefined {
  return builtInRules.get(name);
}

/**
 * Get all registered rule names
 */
export function getRuleNames(): string[] {
  return Array.from(builtInRules.keys());
}
