/**
 * NumberField Component
 *
 * Numeric input field.
 *
 * Limepie PHP golden structure (Fields/Number.php):
 *   <div class="input-group">
 *     [<span class="input-group-text{prepend_class}">{prepend}</span>]
 *     <input type="number" class="valid-target form-control{element_class}"
 *            name=".." data-name=".." data-rule-name=".." value=".."
 *            data-default=".." [readonly] [disabled] [placeholder] [style] />
 *     [<span class="input-group-text{append_class}">{append}</span>]
 *   </div>
 *
 * The value goes through PHP (float) casting — spec default 10 renders
 * value="10", default 0 renders value="0". readonly appends
 * " pointer-events: none;" to element_style.
 */

import React, { useCallback, type ChangeEvent } from 'react';
import type { FieldComponentProps } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { useFormContext } from '../../context/FormContext';
import { toBracketNotationWithPrefix } from '../../utils/dataAttributes';
import { limepieDataAttrs, parseStyleString, phpFloatString, phpString } from './limepieParity';

/**
 * NumberField component
 */
export function NumberField({
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
      const inputValue = e.target.value;

      // Handle empty input
      if (inputValue === '') {
        onChange('');
        return;
      }

      // Parse as number
      const numValue = parseFloat(inputValue);
      if (!isNaN(numValue)) {
        onChange(numValue);
      } else {
        onChange(inputValue);
      }
    },
    [onChange]
  );

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotationWithPrefix(path, keyPrefix || undefined);

  // PHP: if strlen(value) > 0 -> (float)value; if still empty and default
  // isset -> (float)default; otherwise stays ''.
  let displayValue = phpString(value);
  if (displayValue.length > 0) {
    displayValue = phpFloatString(displayValue);
  } else if (spec.default !== undefined && spec.default !== null) {
    displayValue = phpFloatString(spec.default);
  }

  // PHP: readonly appends ' pointer-events: none;' to element_style
  const elementStyle = `${(spec.element_style as string) ?? ''}${readonly ? ' pointer-events: none;' : ''}`;

  const classes = ['valid-target', 'form-control'];
  if (spec.element_class) classes.push(spec.element_class as string);
  if (error) classes.push('is-invalid');

  return (
    <div className="input-group">
      {/* Prepend */}
      {spec.prepend && (
        <span
          className={`input-group-text${spec.prepend_class ? ` ${spec.prepend_class as string}` : ''}`}
          dangerouslySetInnerHTML={{ __html: spec.prepend }}
        />
      )}

      <input
        type="number"
        name={bracketName}
        value={displayValue}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled}
        readOnly={readonly}
        className={classes.join(' ')}
        placeholder={spec.placeholder ? t(spec.placeholder) : undefined}
        style={parseStyleString(elementStyle)}
        {...limepieDataAttrs(spec, path)}
      />

      {/* Append */}
      {spec.append && (
        <span
          className={`input-group-text${spec.append_class ? ` ${spec.append_class as string}` : ''}`}
          dangerouslySetInnerHTML={{ __html: spec.append }}
        />
      )}
    </div>
  );
}

export default NumberField;
