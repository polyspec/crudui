/**
 * Choices from a repeated group (docs/spec/schema.md, "Choices from a repeated group"): a choice
 * field whose `items` is a group source `{ from, label? }` takes its choices from the rows of a
 * repeated group of the same form. This module checks the declaration and reads the choices from
 * the data; the generator lists them and the validator checks a value against them
 * (docs/spec/validation-rules.md, "Values").
 */

import { canonicalText, trim } from './values/index';
import { isRecord } from './record';

/** The field types that take a group source. */
const CHOICE_TYPES: readonly unknown[] = ['select', 'dropdown', 'selectbox', 'choice', 'radio', 'multichoice', 'checkboxes', 'checkcontainer'];

/** One choice of a group source: the canonical text of a row's value and the label text. */
export interface GroupChoice {
  value: string;
  label: string;
}

function has(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/** Whether `items` is a group source: an object with the member `from`. */
export function isGroupSource(items: unknown): items is Record<string, unknown> {
  return isRecord(items) && has(items, 'from');
}

function repeated(field: Record<string, unknown>): boolean {
  return field.multiple === true || field.multiple === 'only' || isRecord(field.multiple);
}

function hasLang(field: Record<string, unknown>): boolean {
  return field.lang === true || isRecord(field.lang);
}

/** Whether `properties` has a direct child `name` that is not repeated, not a group and has no `lang`. */
function scalarChild(properties: Record<string, unknown>, name: unknown): boolean {
  if (typeof name !== 'string' || !has(properties, name)) return false;
  const child = properties[name];
  return isRecord(child) && child.type !== 'group' && !has(child, 'properties') && !repeated(child) && !hasLang(child);
}

/**
 * The child fields of the repeated group that `from` names under the root `properties`, or
 * `undefined` when `from` is not `{group}.*.{field}` for a field of a repeated group outside
 * repeated groups.
 */
function sourceGroup(from: unknown, properties: Record<string, unknown>): Record<string, unknown> | undefined {
  if (typeof from !== 'string') return undefined;
  const segments = from.split('.');
  if (segments.length < 3 || segments[segments.length - 2] !== '*') return undefined;
  const names = segments.slice(0, -2);
  let current = properties;
  for (const [index, name] of names.entries()) {
    if (name === '' || !has(current, name)) return undefined;
    const field = current[name];
    if (!isRecord(field) || field.type !== 'group' || !isRecord(field.properties)) return undefined;
    if (repeated(field) !== (index === names.length - 1)) return undefined;
    current = field.properties;
  }
  return scalarChild(current, segments[segments.length - 1]) ? current : undefined;
}

/**
 * The message of the first rule that the group source of `field` at the declaration `path` breaks
 * under the root `properties`, or `undefined`: the members of `items` in declaration order, the
 * field, `from` and then `label`.
 */
export function groupSourceFailure(field: Record<string, unknown>, path: string, properties: Record<string, unknown>): string | undefined {
  const items = field.items;
  if (!isGroupSource(items)) return undefined;
  for (const key of Object.keys(items)) {
    if (key !== 'from' && key !== 'label') return `Invalid items.${key} at ${path}: unknown key`;
  }
  if (!CHOICE_TYPES.includes(field.type) || hasLang(field)) return `Invalid items.from at ${path}: expected a choice field without lang`;
  const group = sourceGroup(items.from, properties);
  if (group === undefined) {
    return `Invalid items.from at ${path}: expected {group}.*.{field} for a field of a repeated group outside repeated groups`;
  }
  if (has(items, 'label') && !scalarChild(group, items.label)) {
    return `Invalid items.label at ${path}: expected the name of a direct child field of the group without multiple, properties or lang`;
  }
  return undefined;
}

/** The canonical text of a string or a finite number that is not empty after trimming. */
function choiceText(value: unknown): string | undefined {
  if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) return undefined;
  const text = canonicalText(value);
  return text !== undefined && trim(text) !== '' ? text : undefined;
}

/**
 * The choices of a checked group source for the root `data`: one per row of the group in data
 * order whose value is a string or a finite number with a non-empty canonical text, each value
 * once, labelled with the text of its `label` field or else its value.
 */
export function groupChoices(source: Record<string, unknown>, data: unknown): GroupChoice[] {
  const segments = String(source.from).split('.');
  const valueName = segments[segments.length - 1] ?? '';
  let rows: unknown = data;
  for (const name of segments.slice(0, -2)) {
    if (!isRecord(rows) || !has(rows, name)) return [];
    rows = rows[name];
  }
  if (!isRecord(rows)) return [];
  const choices: GroupChoice[] = [];
  const seen = new Set<string>();
  for (const row of Object.values(rows)) {
    if (!isRecord(row)) continue;
    const value = choiceText(row[valueName]);
    if (value === undefined || seen.has(value)) continue;
    seen.add(value);
    const label = typeof source.label === 'string' ? choiceText(row[source.label]) : undefined;
    choices.push({ value, label: label ?? value });
  }
  return choices;
}
