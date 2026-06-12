/**
 * SelectField Component
 *
 * Dropdown select field
 */

import React, { useCallback, useMemo, type ChangeEvent } from 'react';
import type { FieldComponentProps } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { useFormContext } from '../../context/FormContext';
import { toBracketNotationWithPrefix } from '../../utils/dataAttributes';
import { minifyJs } from '../../hooks/legacyDisplay';
import { escAttr, escText, itemEntries, limepieDataAttrs, phpString, phpTruthy } from './limepieParity';

/**
 * SelectField component
 */
export function SelectField({
  spec,
  value,
  onChange,
  onBlur,
  error,
  disabled,
  readonly,
  path,
  language,
  buttons,
  buttonsHtml,
  onButtonsClick,
}: FieldComponentProps) {
  const { t } = useI18n();
  const { keyPrefix } = useFormContext();

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  // Parse items
  const options = useMemo(() => {
    const items = spec.items;

    if (!items) {
      return [];
    }

    // Check if items is an object with model/method (dynamic items)
    if (typeof items === 'object' && !Array.isArray(items) && 'model' in items) {
      // Dynamic items - would need to be loaded externally
      return [];
    }

    // Static items object
    const result: Array<{ value: string; label: string; group?: string }> = [];

    // Helper to check if an object is a multi-language text object
    const isMultiLangText = (obj: unknown): boolean => {
      if (typeof obj !== 'object' || obj === null) return false;
      const keys = Object.keys(obj);
      // Check if keys are language codes (ko, en, ja, zh)
      const langCodes = ['ko', 'en', 'ja', 'zh'];
      return keys.length > 0 && keys.every(key => langCodes.includes(key));
    };

    // itemEntries keeps the spec's entry order (ordered pair form supported)
    for (const [key, val] of itemEntries(items)) {
      if (typeof val === 'object' && val !== null) {
        if (isMultiLangText(val)) {
          // Multi-language label object
          result.push({
            value: key,
            label: t(val as Record<string, string>),
          });
        } else {
          // Grouped options
          for (const [subKey, subVal] of Object.entries(val as Record<string, unknown>)) {
            result.push({
              value: subKey,
              label: t(subVal as string | Record<string, string>),
              group: key,
            });
          }
        }
      } else {
        // Simple string option
        result.push({
          value: key,
          label: t(val as string),
        });
      }
    }

    return result;
  }, [spec.items, t]);

  // Group options by group
  const groupedOptions = useMemo(() => {
    const groups: Record<string, Array<{ value: string; label: string }>> = {};
    const ungrouped: Array<{ value: string; label: string }> = [];

    for (const option of options) {
      if (option.group) {
        if (!groups[option.group]) {
          groups[option.group] = [];
        }
        groups[option.group]!.push({ value: option.value, label: option.label });
      } else {
        ungrouped.push({ value: option.value, label: option.label });
      }
    }

    return { groups, ungrouped };
  }, [options]);

  const hasGroups = Object.keys(groupedOptions.groups).length > 0;

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotationWithPrefix(path, keyPrefix || undefined);

  // PHP Select: if (0 === strlen((string)$value)) $value = $property['default'] ?? '';
  // The default option therefore renders with selected="selected".
  const effectiveValue = (() => {
    const v = phpString(value);
    return v.length === 0 ? phpString(spec.default) : v;
  })();

  // PHP: class="valid-target form-select{element_class}"
  const classes = ['valid-target', 'form-select'];
  if (spec.element_class) classes.push(spec.element_class as string);
  if (error) classes.push('is-invalid');

  // Legacy-raw branch: spec-authored inline onchange (Select.php emits
  // ` onchange="minify_js($onchange);"`) and/or dynamic_onchange row buttons
  // (onclick attribute on every button). React rejects string on* props, so
  // the whole .input-group renders raw — same stance as ChoiceField's
  // inline-JS branch. Row actions stay interactive via delegated clicks.
  const readonlyTruthy = phpTruthy(phpString(spec.readonly));
  const inlineOnchange =
    typeof spec.onchange === 'string' && spec.onchange ? `${minifyJs(spec.onchange)};` : null;
  const dynActive =
    typeof (spec as Record<string, unknown>).dynamic_onchange === 'string' &&
    (spec as Record<string, unknown>).dynamic_onchange !== '' &&
    Boolean(buttonsHtml);

  if ((inlineOnchange && !readonlyTruthy) || dynActive) {
    const dataAttrs = limepieDataAttrs(spec, path);
    // PHP: readonly appends the appearance-reset chunk to element_style
    let elementStyle = (spec.element_style as string) ?? '';
    if (readonlyTruthy) {
      elementStyle +=
        "-webkit-appearance: none; -moz-appearance: none; text-indent: 1px;text-overflow: ''; pointer-events: none;";
    }
    // PHP: readonly wins over onchange (if/elseif)
    const onchangeAttr = readonlyTruthy
      ? ` readonly onfocus="this.initialSelect = this.selectedIndex;" onchange="this.selectedIndex = this.initialSelect;"`
      : inlineOnchange
        ? ` onchange="${escAttr(inlineOnchange)}"`
        : '';

    // Faithful port of the Select.php items loop (simple + optgroup forms;
    // multi-lang labels resolve by the current language key first).
    const disabledAll = phpTruthy(phpString(spec.disabled)) ? 'disabled="disabled"' : '';
    const disables = Array.isArray((spec as Record<string, unknown>).disables)
      ? ((spec as Record<string, unknown>).disables as unknown[]).map((d) => phpString(d))
      : [];
    let optionHtml = '';
    const items = spec.items;
    if (items && typeof items === 'object' && !('model' in items)) {
      for (const [itemValueRaw, itemTextRaw] of Object.entries(
        items as Record<string, unknown>
      )) {
        let itemText: unknown = itemTextRaw;
        if (itemText !== null && typeof itemText === 'object' && !Array.isArray(itemText)) {
          const langText = (itemText as Record<string, unknown>)[language];
          if (langText !== undefined) itemText = langText;
        }
        const itemValue = phpString(itemValueRaw);
        if (itemText !== null && typeof itemText === 'object') {
          // optgroup branch: label "GROUP > SUB"
          optionHtml += `<optgroup label="${escAttr(itemValue)}">`;
          for (const [subValRaw, subTextRaw] of Object.entries(
            itemText as Record<string, unknown>
          )) {
            const subVal = phpString(subValRaw);
            const dis = disables.includes(subVal) ? 'disabled="disabled"' : disabledAll;
            const subText = phpString(subTextRaw);
            const label = escText(subText ? `${itemValue} > ${subText}` : itemValue);
            optionHtml +=
              effectiveValue === subVal
                ? `<option value="${escAttr(subVal)}" selected="selected"${dis}>${label}</option>`
                : `<option value="${escAttr(subVal)}" ${dis}>${label}</option>`;
          }
          optionHtml += '</optgroup>';
        } else {
          const dis = disables.includes(itemValue) ? 'disabled="disabled"' : disabledAll;
          const label = escText(phpString(itemText));
          optionHtml +=
            effectiveValue === itemValue
              ? `<option value="${escAttr(itemValue)}" selected="selected"${dis}>${label}</option>`
              : `<option value="${escAttr(itemValue)}" ${dis}>${label}</option>`;
        }
      }
    } else {
      optionHtml = '<option value="">select</option>';
    }

    const prependHtml = spec.prepend
      ? `<span class="input-group-text">${spec.prepend}</span>`
      : '';
    const appendHtml = spec.append
      ? `<span class="input-group-text">${spec.append}</span>`
      : '';
    const selectHtml =
      `<select class="valid-target form-select${spec.element_class ? ` ${spec.element_class as string}` : ''}"` +
      (elementStyle.trim() ? ` style="${escAttr(elementStyle)}"` : '') +
      ` name="${escAttr(bracketName)}" data-name="${escAttr(dataAttrs['data-name']!)}"` +
      ` data-rule-name="${escAttr(dataAttrs['data-rule-name']!)}"` +
      onchangeAttr +
      ` data-default="${escAttr(dataAttrs['data-default']!)}">${optionHtml}</select>`;

    return (
      <div
        className="input-group"
        onClick={onButtonsClick}
        dangerouslySetInnerHTML={{
          __html: prependHtml + selectHtml + appendHtml + (buttonsHtml ?? ''),
        }}
      />
    );
  }

  return (
    <div className="input-group">
      {/* Prepend */}
      {spec.prepend && (
        <span className="input-group-text" dangerouslySetInnerHTML={{ __html: spec.prepend }} />
      )}

      <select
        name={bracketName}
        value={effectiveValue}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled || readonly}
        className={classes.join(' ')}
        {...limepieDataAttrs(spec, path)}
      >
        {/* PHP: no items at all -> <option value="">select</option> */}
        {options.length === 0 && <option value="">select</option>}

        {/* Ungrouped options */}
        {groupedOptions.ungrouped.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}

        {/* Grouped options */}
        {hasGroups &&
          Object.entries(groupedOptions.groups).map(([groupLabel, groupOptions]) => (
            <optgroup key={groupLabel} label={groupLabel}>
              {groupOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
      </select>

      {/* Append */}
      {spec.append && (
        <span className="input-group-text" dangerouslySetInnerHTML={{ __html: spec.append }} />
      )}

      {/* Multiple-row buttons — legacy `<!--btn-->` slot (after append) */}
      {buttons}
    </div>
  );
}

export default SelectField;
