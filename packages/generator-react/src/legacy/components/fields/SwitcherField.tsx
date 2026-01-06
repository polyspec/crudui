/**
 * SwitcherField Component
 *
 * Boolean toggle switch
 * Matches PHP Limepie structure: div > input + span
 */

import React, { useCallback, type ChangeEvent } from 'react';
import type { FieldComponentProps } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { useFormContext } from '../../context/FormContext';
import { getLimepieDataAttributes, toBracketNotationWithPrefix, getCheckboxClasses } from '../../utils/dataAttributes';

/**
 * SwitcherField component
 * PHP Limepie structure:
 * <div>
 *   <input type="checkbox" class="valid-target" value="1" checked /> <span>Label</span>
 * </div>
 */
export function SwitcherField({
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
  const { t } = useI18n();
  const { keyPrefix } = useFormContext();

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.checked);
    },
    [onChange]
  );

  // Labels for on/off states
  const onLabel = (spec.on_label as string) ?? t('on') ?? 'On';

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotationWithPrefix(path, keyPrefix || undefined);

  return (
    <div>
      {/* Prepend */}
      {spec.prepend && (
        <span dangerouslySetInnerHTML={{ __html: spec.prepend }} />
      )}

      <input
        type="checkbox"
        name={bracketName}
        value="1"
        checked={Boolean(value)}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled || readonly}
        className={getCheckboxClasses(spec, !!error)}
        {...getLimepieDataAttributes(spec, path, language)}
      />
      {' '}
      {spec.show_labels !== false && (
        <span>{onLabel}</span>
      )}

      {/* Append */}
      {spec.append && (
        <span dangerouslySetInnerHTML={{ __html: spec.append }} />
      )}
    </div>
  );
}

export default SwitcherField;
