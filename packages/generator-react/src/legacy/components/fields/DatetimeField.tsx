/**
 * DatetimeField Component
 *
 * Date and time input field.
 *
 * Legacy PHP reference structure (Fields/Datetime.php) — a BARE input, no
 * input-group wrapper:
 *   <input type="datetime-local" class="valid-target form-control" name=".."
 *          data-name=".." data-rule-name=".." value=".." data-default=".."
 *          [readonly] [onchange/data-onload] [style] />
 *
 * value/default format is PHP date('Y-m-d\TH:i:s') — seconds included.
 *
 * spec.event ({type: [onchange|onload], function}) and string spec.onchange
 * emit inline onchange="" / data-onload="" attributes (minified JS, PHP
 * str_replace('"','\"') applied first). React rejects string on* props and
 * the reference input sits DIRECTLY inside .input-group-wrapper, so FormField
 * renders datetimeLegacyRawHtml() on the wrapper for those specs — the
 * input is legacy jQuery surface there (same stance as ChoiceField's raw
 * branch).
 */

import React, { useCallback, type ChangeEvent } from 'react';
import type { FieldComponentProps, FieldSpec } from '../../types';
import { useFormContext } from '../../context/FormContext';
import { toBracketNotationWithPrefix } from '../../utils/dataAttributes';
import { minifyJs } from '../../hooks/legacyDisplay';
import {
  escAttr,
  leafName,
  legacyDataAttrs,
  parseStyleString,
  phpString,
  ruleNameForPath,
} from './legacyParity';

/** Legacy event option shape (Fields/Datetime.php). */
interface DatetimeEventSpec {
  type?: unknown;
  function?: unknown;
}

/**
 * True when the spec carries inline-JS attributes that force the raw branch
 * (event with a non-empty type list, or a string onchange).
 */
export function datetimeNeedsRawHtml(spec: FieldSpec): boolean {
  const event = (spec as Record<string, unknown>).event as DatetimeEventSpec | undefined;
  if (event && Array.isArray(event.type) && event.type.length > 0) return true;
  const onchange = (spec as Record<string, unknown>).onchange;
  return typeof onchange === 'string' && onchange !== '';
}

/** PHP: minify_js(str_replace('"', '\"', $function)). */
function inlineJs(fn: string): string {
  return minifyJs(fn.split('"').join('\\"'));
}

/**
 * Verbatim port of Fields/Datetime.php::write for inline-JS specs — the
 * full <input> markup rendered raw on the .input-group-wrapper by FormField.
 */
export function datetimeLegacyRawHtml(
  spec: FieldSpec,
  path: string,
  keyPrefix: string | undefined,
  value: unknown
): string {
  const bracketName = toBracketNotationWithPrefix(path, keyPrefix);
  const rawValue = phpString(value) || phpString(spec.default);
  const formattedValue = formatDatetimeValue(rawValue || undefined);

  let onchange = '';
  const event = (spec as Record<string, unknown>).event as DatetimeEventSpec | undefined;
  if (event) {
    const fn = typeof event.function === 'string' ? event.function : '';
    const types = Array.isArray(event.type) ? event.type : [];
    for (const ev of types) {
      if (ev === 'onchange') onchange += ` onchange="${escAttr(inlineJs(fn))}"`;
      if (ev === 'onload') onchange += ` data-onload="${escAttr(inlineJs(fn))}"`;
    }
  }
  const specOnchange = (spec as Record<string, unknown>).onchange;
  if (typeof specOnchange === 'string' && specOnchange !== '') {
    onchange += ` onchange="${escAttr(inlineJs(specOnchange))}"`;
  }

  const readonly = spec.readonly ? ' readonly="readonly"' : '';
  const style =
    typeof spec.style === 'string' && spec.style ? ` style="${escAttr(spec.style)}"` : '';

  return (
    `<input type="datetime-local" class="valid-target form-control"` +
    ` name="${escAttr(bracketName)}" data-name="${escAttr(leafName(path))}"` +
    ` data-rule-name="${escAttr(ruleNameForPath(path))}"` +
    ` value="${escAttr(formattedValue)}" data-default="${escAttr(phpString(spec.default))}"` +
    `${readonly}${onchange}${style} />`
  );
}

/**
 * DatetimeField component
 */
export function DatetimeField({
  spec,
  value,
  onChange,
  onBlur,
  error,
  disabled,
  readonly,
  path,
}: FieldComponentProps) {
  const { keyPrefix } = useFormContext();

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  // PHP: value falls back to date('Y-m-d\TH:i:s', strtotime(default))
  const rawValue = phpString(value) || phpString(spec.default);
  const formattedValue = formatDatetimeValue(rawValue || undefined);

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotationWithPrefix(path, keyPrefix || undefined);

  return (
    <input
      type="datetime-local"
      name={bracketName}
      value={formattedValue}
      onChange={handleChange}
      onBlur={onBlur}
      disabled={disabled}
      readOnly={readonly}
      className={error ? 'valid-target form-control is-invalid' : 'valid-target form-control'}
      style={parseStyleString(spec.style)}
      {...legacyDataAttrs(spec, path)}
    />
  );
}

/**
 * Format datetime value as PHP date('Y-m-d\TH:i:s')
 */
function formatDatetimeValue(value: string | undefined): string {
  if (!value) return '';

  // Already in YYYY-MM-DDTHH:mm[:ss] form — normalize to include seconds
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?/.exec(value);
  if (m) {
    return m[1] + (m[2] ?? ':00');
  }

  // Try to parse and format
  try {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return (
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
        `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
      );
    }
  } catch {
    // Invalid date
  }

  return value;
}

export default DatetimeField;
