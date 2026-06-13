/**
 * EmailField Component
 *
 * Email input field.
 *
 * Limepie PHP reference structure (Fields/Email.php):
 *   <div class="input-group">
 *     [<span class="input-group-text">{prepend}</span>]
 *     <input type="email" class="valid-target form-control{element_class}"
 *            name=".." data-name=".." data-rule-name=".." value=".."
 *            data-default=".." [readonly] [disabled] [placeholder]
 *            [autocomplete] />
 *     [<span class="input-group-text">{append}</span>]
 *   </div>
 *
 * placeholder is emitted ONLY when the spec sets one (no hardcoded
 * example@email.com fallback).
 */

import React, { useCallback, type ChangeEvent } from 'react';
import type { FieldComponentProps } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { useFormContext } from '../../context/FormContext';
import { toBracketNotationWithPrefix } from '../../utils/dataAttributes';
import { applyDefaultString, limepieDataAttrs } from './limepieParity';

/**
 * EmailField component
 */
export function EmailField({
  spec,
  value,
  onChange,
  onBlur,
  error,
  disabled,
  readonly,
  path,
}: FieldComponentProps) {
  const { t } = useI18n();
  const { keyPrefix } = useFormContext();

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotationWithPrefix(path, keyPrefix || undefined);

  // PHP: empty value falls back to (string)$property['default'] (non-array)
  const displayValue = applyDefaultString(value, spec.default);

  const classes = ['valid-target', 'form-control'];
  if (spec.element_class) classes.push(spec.element_class as string);
  if (error) classes.push('is-invalid');

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
        type="email"
        name={bracketName}
        value={displayValue}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled}
        readOnly={readonly}
        className={classes.join(' ')}
        placeholder={spec.placeholder ? t(spec.placeholder) : undefined}
        autoComplete={spec.autocomplete as string | undefined}
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

export default EmailField;
