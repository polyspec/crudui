/**
 * TextField Component
 *
 * Basic text input field.
 *
 * Limepie PHP reference structure (Fields/Text.php):
 *   <div class="input-group">
 *     [<span class="input-group-text{prepend_class}">{prepend}</span>]
 *     <input type="text" class="valid-target form-control{element_class}"
 *            name=".." value=".." data-name=".." data-rule-name=".."
 *            data-default=".." [readonly] [disabled] [placeholder] [style]
 *            [autocomplete] />
 *     [<span class="input-group-text{append_class}">{append}</span>]
 *   </div>
 *
 * readonly adds " pointer-events: none;" to element_style and the value
 * falls back to the spec default when empty.
 */

import React, { useCallback, type ChangeEvent } from 'react';
import type { FieldComponentProps } from '../../types';
import { useFormContext } from '../../context/FormContext';
import { useI18n } from '../../context/I18nContext';
import { toBracketNotationWithPrefix } from '../../utils/dataAttributes';
import {
  applyDefaultString,
  escAttr,
  limepieDataAttrs,
  parseStyleString,
} from './limepieParity';

/**
 * TextField component
 */
export function TextField({
  spec,
  value,
  onChange,
  onBlur,
  error,
  disabled,
  readonly,
  path,
  buttons,
  buttonsHtml,
  onButtonsClick,
}: FieldComponentProps) {
  const { keyPrefix } = useFormContext();
  const { t } = useI18n();

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  // Convert path to bracket notation with keyPrefix for name attribute
  const bracketName = toBracketNotationWithPrefix(path, keyPrefix || undefined);

  // PHP: empty value falls back to (string)$property['default']
  const displayValue = applyDefaultString(value, spec.default);

  // PHP: readonly appends ' pointer-events: none;' to element_style
  const elementStyle = `${(spec.element_style as string) ?? ''}${readonly ? ' pointer-events: none;' : ''}`;

  const classes = ['valid-target', 'form-control'];
  if (spec.element_class) classes.push(spec.element_class as string);
  if (error) classes.push('is-invalid');

  // Legacy-raw branch: dynamic_onchange rows need an onclick ATTRIBUTE on
  // every row button (Fields::addElement). React rejects string on* props
  // and the buttons are direct .input-group children (no wrapper allowed by
  // the reference contract), so the whole row renders raw. Row actions stay
  // interactive through delegated clicks on the container; the input itself
  // is legacy jQuery surface (same stance as ChoiceField's raw branch).
  if (
    typeof (spec as Record<string, unknown>).dynamic_onchange === 'string' &&
    (spec as Record<string, unknown>).dynamic_onchange !== '' &&
    buttonsHtml
  ) {
    const dataAttrs = limepieDataAttrs(spec, path);
    const prependHtml = spec.prepend
      ? `<span class="input-group-text${spec.prepend_class ? ` ${spec.prepend_class as string}` : ''}">${spec.prepend}</span>`
      : '';
    const appendHtml = spec.append
      ? `<span class="input-group-text${spec.append_class ? ` ${spec.append_class as string}` : ''}">${spec.append}</span>`
      : '';
    const inputHtml =
      `<input type="text" class="${escAttr(classes.join(' '))}"` +
      ` name="${escAttr(bracketName)}" value="${escAttr(displayValue)}"` +
      ` data-name="${escAttr(dataAttrs['data-name']!)}"` +
      ` data-rule-name="${escAttr(dataAttrs['data-rule-name']!)}"` +
      ` data-default="${escAttr(dataAttrs['data-default']!)}"` +
      (readonly ? ' readonly="readonly"' : '') +
      (disabled ? ' disabled="disabled"' : '') +
      (spec.placeholder ? ` placeholder="${escAttr(t(spec.placeholder))}"` : '') +
      (elementStyle.trim() ? ` style="${escAttr(elementStyle)}"` : '') +
      (spec.autocomplete ? ` autocomplete="${escAttr(spec.autocomplete as string)}"` : '') +
      ' />';
    return (
      <div
        className="input-group"
        onClick={onButtonsClick}
        dangerouslySetInnerHTML={{
          __html: prependHtml + inputHtml + appendHtml + buttonsHtml,
        }}
      />
    );
  }

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
        type="text"
        name={bracketName}
        value={displayValue}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled}
        readOnly={readonly}
        className={classes.join(' ')}
        placeholder={spec.placeholder ? t(spec.placeholder) : undefined}
        maxLength={spec.maxlength as number | undefined}
        autoFocus={spec.autofocus === true}
        autoComplete={spec.autocomplete as string | undefined}
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

      {/* Multiple-row buttons — legacy `<!--btn-->` slot (after append) */}
      {buttons}
    </div>
  );
}

export default TextField;
