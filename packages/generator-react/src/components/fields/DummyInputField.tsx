/**
 * DummyInputField Component
 *
 * Always-readonly display input ("dummy-input" type).
 *
 * Limepie PHP golden structure (Fields/DummyInput.php), verified via
 * tools/limepie-baseline/render.php:
 *   <div class="input-group">
 *     [<span class="input-group-text">{prepend}</span>]
 *     <input type="text" class="form-control{element_class}" name=".."
 *            value=".." data-default=".." readonly="readonly" [disabled]
 *            [placeholder] [style] />
 *     [<span class="input-group-text">{append}</span>]
 *   </div>
 *
 * Notes: NO valid-target class, NO data-name / data-rule-name (the field is
 * excluded from validation). readonly is unconditional; element_style gains
 * " pointer-events: none;" only when spec.readonly is truthy.
 */

import React from 'react';
import type { FieldComponentProps } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { useFormContext } from '../../context/FormContext';
import { toBracketNotationWithPrefix } from '../../utils/dataAttributes';
import { applyDefaultString, parseStyleString, phpString } from './limepieParity';

/**
 * DummyInputField component
 */
export function DummyInputField({
  spec,
  value,
  disabled,
  path,
}: FieldComponentProps) {
  const { t } = useI18n();
  const { keyPrefix } = useFormContext();

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotationWithPrefix(path, keyPrefix || undefined);

  // PHP: empty value falls back to (string)$property['default'] (non-array)
  const displayValue = applyDefaultString(value, spec.default);

  // PHP: ' pointer-events: none;' appended only when spec.readonly truthy
  const elementStyle = `${(spec.element_style as string) ?? ''}${spec.readonly ? ' pointer-events: none;' : ''}`;

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
        type="text"
        name={bracketName}
        value={displayValue}
        readOnly
        disabled={disabled || spec.disabled === true}
        className={`form-control${spec.element_class ? ` ${spec.element_class as string}` : ''}`}
        placeholder={spec.placeholder ? t(spec.placeholder) : undefined}
        style={parseStyleString(elementStyle)}
        data-default={phpString(spec.default)}
        onChange={() => undefined}
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

export default DummyInputField;
