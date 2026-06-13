/**
 * DummyField Component
 *
 * Non-input display element — verbatim port of the legacy Legacy
 * Generator\Fields\Dummy::write() (single source of truth =
 * tests/fixtures/reference-html, e.g. LargeForm option_* title rows):
 *
 *   <div class="{element_class}" style="{element_style}">{value}</div>
 *
 * Value resolution pinned by the reference contract:
 *   - the group walker substitutes a truthy spec default when data is null
 *     (Group.php: `null === $currentData && $currentSpec['default']`)
 *   - `items[value] ?? value` lookup when an items map exists
 *   - nl2br on PHP-truthy values
 *
 * Do NOT reintroduce template/label wrappers here — legacy renders exactly
 * one div with the element class/style.
 */

import React from 'react';
import type { FieldComponentProps } from '../../types';
import { parseStyleString, phpString, phpTruthy } from './legacyParity';

/** PHP nl2br(): insert <br /> BEFORE each newline, keeping the newline. */
function nl2br(s: string): string {
  return s.replace(/(\r\n|\n\r|\r|\n)/g, '<br />$1');
}

/**
 * DummyField component
 */
export function DummyField({ spec, value }: FieldComponentProps) {
  // Group walker default substitution: null data + PHP-truthy default
  let v: unknown = value;
  if ((v === null || v === undefined) && phpTruthy(phpString(spec.default))) {
    v = spec.default;
  }

  // PHP: $property['items'][$value] ?? $value
  const items = spec.items;
  if (items && typeof items === 'object' && !Array.isArray(items) && !('model' in items)) {
    const looked = (items as Record<string, unknown>)[phpString(v)];
    if (looked !== undefined) v = looked;
  }

  const text = phpString(v);
  // PHP: if ($value) { $value = nl2br((string)$value); }
  const html = phpTruthy(text) ? nl2br(text) : text;

  return (
    <div
      className={spec.element_class ? String(spec.element_class) : ''}
      style={parseStyleString(spec.element_style) ?? {}}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default DummyField;
