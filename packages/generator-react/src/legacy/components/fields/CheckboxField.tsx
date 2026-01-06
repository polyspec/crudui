/**
 * CheckboxField Component
 *
 * Single checkbox for boolean values
 * Matches PHP Limepie structure: div > input + span
 */

import React, { useCallback, type ChangeEvent } from 'react';
import type { FieldComponentProps } from '../../types';
import { useFormContext } from '../../context/FormContext';
import { useI18n } from '../../context/I18nContext';
import { getLimepieDataAttributes, toBracketNotationWithPrefix, getCheckboxClasses } from '../../utils/dataAttributes';

/**
 * CheckboxField component
 * PHP Limepie structure:
 * <div>
 *   <input type="checkbox" class="valid-target" value="1" checked /> <span>Label</span>
 * </div>
 */
export function CheckboxField({
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
  const { t } = useI18n();

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.checked);
    },
    [onChange]
  );

  // Determine the label text
  const checkboxLabel = spec.checkbox_label ?? spec.label;

  // Convert path to bracket notation with keyPrefix for name attribute
  // e.g., "product[inventory][track_inventory]"
  const fullBracketName = toBracketNotationWithPrefix(path, keyPrefix || undefined);

  return (
    <div>
      {/* Prepend */}
      {spec.prepend && (
        <span dangerouslySetInnerHTML={{ __html: spec.prepend }} />
      )}

      <input
        type="checkbox"
        name={fullBracketName}
        value="1"
        checked={Boolean(value)}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled || readonly}
        className={getCheckboxClasses(spec, !!error)}
        {...getLimepieDataAttributes(spec, path, language)}
      />
      {' '}
      {checkboxLabel && (
        <span dangerouslySetInnerHTML={{ __html: t(checkboxLabel) }} />
      )}

      {/* Append */}
      {spec.append && (
        <span dangerouslySetInnerHTML={{ __html: spec.append }} />
      )}
    </div>
  );
}

export default CheckboxField;
