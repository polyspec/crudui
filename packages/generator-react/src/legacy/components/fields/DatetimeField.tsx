/**
 * DatetimeField Component
 *
 * Date and time input field
 */

import React, { useCallback, type ChangeEvent } from 'react';
import type { FieldComponentProps } from '../../types';
import { getLimepieDataAttributes, toBracketNotation, getInputClasses } from '../../utils/dataAttributes';

/**
 * DatetimeField component
 */
export function DatetimeField({
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
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  // Format value for datetime-local input
  const formattedValue = formatDatetimeValue(value as string | undefined);

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotation(path);

  return (
    <input
      type="datetime-local"
      name={bracketName}
      value={formattedValue}
      onChange={handleChange}
      onBlur={onBlur}
      disabled={disabled}
      readOnly={readonly}
      className={getInputClasses('', spec, !!error)}
      min={spec.min as string | undefined}
      max={spec.max as string | undefined}
      step={spec.step as number | undefined}
      autoFocus={spec.autofocus === true}
      {...getLimepieDataAttributes(spec, path, language)}
    />
  );
}

/**
 * Format datetime value for datetime-local input
 */
function formatDatetimeValue(value: string | undefined): string {
  if (!value) return '';

  // If already in correct format (YYYY-MM-DDTHH:mm)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    // Remove seconds if present
    return value.slice(0, 16);
  }

  // Try to parse and format
  try {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      // Format as YYYY-MM-DDTHH:mm
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    }
  } catch {
    // Invalid date
  }

  return value;
}

export default DatetimeField;
