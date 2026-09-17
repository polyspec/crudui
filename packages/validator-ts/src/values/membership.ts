/**
 * Membership (validation-rules.md, "Values").
 *
 * Members come from a list (each element as is), a comma-separated string (split
 * at U+002C, each item trimmed) or a map (its keys). Members are strings, numbers
 * or booleans, and no member's canonical text is empty after trimming.
 */

import { canonicalText } from './canonical';
import { trim } from './whitespace';
import { isEmptyValue } from './empty';

/** The parameter messages of `in` (validation-rules.md, "Parameter errors"). */
export const MEMBERSHIP_ERRORS = {
  shape: 'Invalid in parameter: expected a list, a comma-separated string or a map',
  type: 'Invalid in parameter: members must be strings, numbers or booleans',
  empty: 'Invalid in parameter: members must not be empty',
} as const;

/** A member: a string, a finite number or a boolean. */
export type Member = string | number | boolean;

/** Result of reading a membership parameter. */
export type MembersResult = { members: Member[] } | { error: string };

function isMemberType(item: unknown): item is Member {
  return typeof item === 'string' || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item));
}

/** Read the members of an `in` parameter, or the parameter error it causes. */
export function readMembers(param: unknown): MembersResult {
  let members: unknown[];
  if (Array.isArray(param)) {
    members = param;
  } else if (typeof param === 'string') {
    members = param.split(',').map(trim);
  } else if (param !== null && typeof param === 'object') {
    members = Object.keys(param);
  } else {
    return { error: MEMBERSHIP_ERRORS.shape };
  }
  if (members.length === 0) return { error: MEMBERSHIP_ERRORS.empty };
  for (const member of members) {
    if (!isMemberType(member)) return { error: MEMBERSHIP_ERRORS.type };
    if (trim(canonicalText(member) as string) === '') return { error: MEMBERSHIP_ERRORS.empty };
  }
  return { members: members as Member[] };
}

/** The decimal grammar under which numbers and strings compare as doubles. */
const DECIMAL = /^[-+]?([0-9]+\.?[0-9]*|[0-9]*\.?[0-9]+)$/;

/** The double a number or decimal-grammar string denotes, or `undefined`. */
function decimalValue(item: unknown): number | undefined {
  if (typeof item === 'number') return item;
  if (typeof item === 'string' && DECIMAL.test(item)) return Number(item);
  return undefined;
}

/** Whether one scalar value matches one member. */
function matchesMember(value: string | number | boolean, member: Member): boolean {
  const text = canonicalText(value);
  if (text === undefined) return false;
  if (text === canonicalText(member)) return true;
  const left = decimalValue(value);
  const right = decimalValue(member);
  return left !== undefined && right !== undefined && left === right;
}

/** Whether a scalar value (a string is trimmed first) is one of the members. */
function isScalarMember(value: unknown, members: readonly Member[]): boolean {
  if (typeof value === 'string') value = trim(value);
  if (!isMemberType(value)) return false;
  const scalar = value;
  return members.some((member) => matchesMember(scalar, member));
}

/**
 * Whether a value is a member. An array value is a member when every element
 * is: an empty element (missing, `null`, a blank string, an empty array or an
 * empty object) passes as an empty value does, and a non-empty array or object
 * element fails.
 */
export function isMember(value: unknown, members: readonly Member[]): boolean {
  if (Array.isArray(value)) {
    return value.every((element) => isEmptyValue(element) || isScalarMember(element, members));
  }
  return isScalarMember(value, members);
}
