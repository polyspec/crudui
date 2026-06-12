/**
 * CheckboxField Component
 *
 * Single checkbox for boolean values.
 *
 * Legacy PHP golden structure (Fields/Checkbox.php):
 *   <div>
 *     <input type="checkbox" class="valid-target" name=".." data-name=".."
 *            data-rule-name=".." value="1" [checked] [style] />
 *     <span>{label}</span>
 *   </div>
 *
 * No data-default, no form-check classes, span is always rendered (empty
 * when the spec has no top-level label).
 */

import React, { useCallback, type ChangeEvent } from 'react';
import type { FieldComponentProps } from '../../types';
import { useFormContext } from '../../context/FormContext';
import { useI18n } from '../../context/I18nContext';
import { toBracketNotationWithPrefix } from '../../utils/dataAttributes';
import {
  phpString,
  phpTruthy,
  leafName,
  ruleNameForPath,
  parseStyleString,
} from './legacyParity';

/**
 * CheckboxField component
 */
export function CheckboxField({
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
  const { t } = useI18n();

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.checked);
    },
    [onChange]
  );

  // PHP: $title = $property['label'] (language-resolved); '' when absent.
  const title = spec.label ? t(spec.label) : '';

  // Full bracket path for name attribute, e.g. "product[inventory][track_inventory]"
  const fullBracketName = toBracketNotationWithPrefix(path, keyPrefix || undefined);

  // PHP: $value = (string)$value; if ('' === $value) $value = (string)$default;
  // $checked = (bool)$value.  Explicit boolean React state wins (interactive
  // unchecking of a default-true checkbox must stick).
  let checked: boolean;
  if (typeof value === 'boolean') {
    checked = value;
  } else {
    const v = phpString(value);
    const effective = v.length === 0 ? phpString(spec.default) : v;
    checked = phpTruthy(effective);
  }

  return (
    <div>
      <input
        type="checkbox"
        name={fullBracketName}
        value="1"
        checked={checked}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled || readonly}
        className={error ? 'valid-target is-invalid' : 'valid-target'}
        data-name={leafName(path)}
        data-rule-name={ruleNameForPath(path)}
        style={parseStyleString(spec.style)}
      />
      {' '}
      <span>{title}</span>
    </div>
  );
}

export default CheckboxField;
