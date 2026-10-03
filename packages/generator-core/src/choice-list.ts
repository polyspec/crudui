/**
 * Choice lists (docs/spec/schema.md, "Choice lists"): an `items` array of
 * `{ value, label }` objects whose choices keep the list order for any values. The choices of a
 * choice or multichoice field may also declare `class`, `style` and `attributes`
 * (docs/spec/schema.md, "Choice appearance").
 */

import { FormInputError } from '@crudui/validator';
import { styleString } from './css';
import { checkDeclaredAttributes } from './design';

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

/** The members a choice of a choice or multichoice field may declare besides `value` and `label`. */
const APPEARANCE_MEMBERS: readonly string[] = ['class', 'style', 'attributes'];

/**
 * The `[value text, label]` pairs of a choice list in list order, or `undefined` when an
 * element has another member (an appearance member is accepted with `appearance`), lacks `value`
 * or `label`, has a value that is not a string or a finite number, or repeats the canonical text
 * of an earlier value.
 */
export function choicePairs(items: readonly unknown[], appearance = false): Array<[string, unknown]> | undefined {
  const pairs: Array<[string, unknown]> = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!isPlainObject(item)) return undefined;
    const has = (key: string) => Object.prototype.hasOwnProperty.call(item, key);
    const extra = Object.keys(item).filter((key) => key !== 'value' && key !== 'label');
    if (!has('value') || !has('label') || extra.some((key) => !appearance || !APPEARANCE_MEMBERS.includes(key))) return undefined;
    const text = valueText(item.value);
    if (text === undefined || seen.has(text)) return undefined;
    seen.add(text);
    pairs.push([text, item.label]);
  }
  return pairs;
}

/** The appearance of one choice: the label class and style and the input attributes. */
export interface ChoiceAppearance {
  /** Label class (`class`). */
  className?: string;
  /** Label inline style (`style`), normalized as a design style. */
  style?: string;
  /** Input attributes (`attributes`). */
  attributes?: Record<string, string>;
}

/**
 * Reject the appearance of a valid choice list whose `class` or `style` is not a string or whose
 * `attributes` break the declared attribute rules, choice by choice in list order.
 */
export function checkChoiceAppearance(items: readonly unknown[], path: string): void {
  items.forEach((item, index) => {
    const choice = item as Record<string, unknown>;
    for (const member of ['class', 'style']) {
      if (Object.prototype.hasOwnProperty.call(choice, member) && typeof choice[member] !== 'string') {
        throw new FormInputError(`Invalid items.${index}.${member} at ${path}: expected a string`);
      }
    }
    if (Object.prototype.hasOwnProperty.call(choice, 'attributes')) {
      checkDeclaredAttributes(choice.attributes, `items.${index}.attributes`, path);
    }
  });
}

/** The appearance of each choice of a checked choice list in list order; members only when declared. */
export function choiceAppearances(items: readonly unknown[]): ChoiceAppearance[] {
  return items.map((item) => {
    const choice = item as { class?: string; style?: string; attributes?: Record<string, string> };
    const style = styleString(choice.style);
    return {
      ...(choice.class ? { className: choice.class } : {}),
      ...(style ? { style } : {}),
      ...(choice.attributes && Object.keys(choice.attributes).length ? { attributes: { ...choice.attributes } } : {}),
    };
  });
}
