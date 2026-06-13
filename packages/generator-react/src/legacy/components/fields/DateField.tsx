/**
 * DateField Component
 *
 * Date input field.
 *
 * Limepie PHP reference structure (Fields/Date.php):
 *   <div class="input-group">
 *     [<span class="input-group-text">{prepend}</span>]
 *     <input type="date" class="valid-target form-control" name=".."
 *            data-name=".." data-rule-name=".." value=".." data-default=".."
 *            [readonly] />
 *     [<span class="input-group-text">{append}</span>]
 *   </div>
 */

import React, { useCallback, type ChangeEvent } from 'react';
import type { FieldComponentProps } from '../../types';
import { useFormContext } from '../../context/FormContext';
import { toBracketNotationWithPrefix } from '../../utils/dataAttributes';
import { limepieDataAttrs, phpString } from './limepieParity';

/**
 * DateField component
 */
export function DateField({
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

  // PHP: value falls back to date('Y-m-d', strtotime(default)) when empty
  const rawValue = phpString(value) || phpString(spec.default);
  const formattedValue = formatDateValue(rawValue || undefined);

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotationWithPrefix(path, keyPrefix || undefined);

  return (
    <div className="input-group">
      {/* Prepend */}
      {spec.prepend && (
        <span
          className="input-group-text"
          dangerouslySetInnerHTML={{ __html: spec.prepend }}
        />
      )}

      <input
        type="date"
        name={bracketName}
        value={formattedValue}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled}
        readOnly={readonly}
        className={error ? 'valid-target form-control is-invalid' : 'valid-target form-control'}
        {...limepieDataAttrs(spec, path)}
      />

      {/* Append */}
      {spec.append && (
        <span
          className="input-group-text"
          dangerouslySetInnerHTML={{ __html: spec.append }}
        />
      )}
    </div>
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
