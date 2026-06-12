/**
 * TextareaField Component
 *
 * Multi-line text input field.
 *
 * Limepie PHP golden structure (Fields/Textarea.php):
 *   <div class="input-group">
 *     [<span class="input-group-text{prepend_class}">{prepend}</span>]
 *     <textarea class="valid-target form-control {element_class}" [readonly]
 *               [style] name=".." data-name=".." data-rule-name=".."
 *               data-default=".." rows="{rows|5}" [maxlength]>{value}</textarea>
 *     [<span class="input-group-text{append_class}">{append}</span>]
 *   </div>
 *
 * NO placeholder attribute — PHP Textarea does not support it.
 * maxlength is emitted only with counter + rules.maxlength.
 */

import React, { useCallback, type ChangeEvent } from 'react';
import type { FieldComponentProps } from '../../types';
import { useFormContext } from '../../context/FormContext';
import { toBracketNotationWithPrefix } from '../../utils/dataAttributes';
import { applyDefaultString, limepieDataAttrs, parseStyleString } from './limepieParity';

/**
 * TextareaField component
 */
export function TextareaField({
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
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotationWithPrefix(path, keyPrefix || undefined);

  // PHP: empty value falls back to (string)$property['default']
  const displayValue = applyDefaultString(value, spec.default);

  // PHP: maxlength only when counter && rules.maxlength
  const rulesMaxlength = spec.rules?.maxlength;
  const maxLength =
    spec.counter && typeof rulesMaxlength === 'number' ? rulesMaxlength : undefined;

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

      <textarea
        name={bracketName}
        value={displayValue}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled}
        readOnly={readonly}
        className={classes.join(' ')}
        rows={(spec.rows as number | undefined) ?? 5}
        maxLength={maxLength}
        style={parseStyleString(spec.element_style)}
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

export default TextareaField;
