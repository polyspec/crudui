/**
 * Choice lists (docs/spec/schema.md, "Choice lists"): an `items` array of
 * `{ value, label }` objects whose choices keep the list order for any values.
 */

/** The expected-value text of a choice list declaration failure. */
export const CHOICE_LIST_EXPECTED = 'value and label pairs with distinct string or number values';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Whether `items` is a choice list: an array with an object element that has a `value` member. */
export function isChoiceList(items: unknown): items is unknown[] {
  return Array.isArray(items) && items.some((item) => isPlainObject(item) && Object.prototype.hasOwnProperty.call(item, 'value'));
}

/** The canonical text of a choice value: a string itself, a number as `Number.prototype.toString` writes it. */
function valueText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

/**
 * The `[value text, label]` pairs of a choice list in list order, or `undefined` when an
 * element has another member, lacks `value` or `label`, has a value that is not a string or a
 * finite number, or repeats the canonical text of an earlier value.
 */
export function choicePairs(items: readonly unknown[]): Array<[string, unknown]> | undefined {
  const pairs: Array<[string, unknown]> = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!isPlainObject(item)) return undefined;
    const keys = Object.keys(item);
    if (keys.length !== 2 || !Object.prototype.hasOwnProperty.call(item, 'value') || !Object.prototype.hasOwnProperty.call(item, 'label')) return undefined;
    const text = valueText(item.value);
    if (text === undefined || seen.has(text)) return undefined;
    seen.add(text);
    pairs.push([text, item.label]);
  }
  return pairs;
}
