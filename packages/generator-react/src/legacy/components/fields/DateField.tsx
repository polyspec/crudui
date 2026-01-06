/**
 * DateField Component
 *
 * Date input field
 */

import React, { useCallback, type ChangeEvent } from 'react';
import type { FieldComponentProps } from '../../types';
import { useFormContext } from '../../context/FormContext';
import { getLimepieDataAttributes, toBracketNotationWithPrefix, getInputClasses } from '../../utils/dataAttributes';

/**
 * DateField component
 */
export function DateField({
  name,
  spec,
  value,
  onChange,
  onBlur,
  error,
  disabled,
  readonly,
  path,
  language,
}: FieldComponentProps) {
  const { keyPrefix } = useFormContext();

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  // Format value as YYYY-MM-DD for date input
  const formattedValue = formatDateValue(value as string | undefined);

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotationWithPrefix(path, keyPrefix || undefined);

  return (
    <input
      type="date"
      id={path}
      name={bracketName}
      value={formattedValue}
      onChange={handleChange}
      onBlur={onBlur}
      disabled={disabled}
      readOnly={readonly}
      className={getInputClasses('', spec, !!error)}
      min={spec.min as string | undefined}
      max={spec.max as string | undefined}
      autoFocus={spec.autofocus === true}
      {...getLimepieDataAttributes(spec, path, language)}
    />
  );
}

/**
 * Format date value to YYYY-MM-DD
 */
function formatDateValue(value: string | undefined): string {
  if (!value) return '';

  // If already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  // Try to parse and format
  try {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0] ?? '';
    }
  } catch {
    // Invalid date
  }

  return value;
}

export default DateField;
