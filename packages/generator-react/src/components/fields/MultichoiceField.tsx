/**
 * MultichoiceField Component
 *
 * Checkbox group for multiple selection.
 *
 * Limepie PHP reference structure (Fields/Multichoice.php):
 *   <div class="btn-group flex-wrap btn-group-toggle">
 *     <input type="checkbox" name="{key}" id="mchoice-{clean_key}{n}"
 *            class="valid-target btn-check" autocomplete="off"
 *            data-name=".." data-rule-name=".." value="{k}" [checked]>
 *     <label for="mchoice-{clean_key}{n}"
 *            class="btn btn-switch btn-mswitch {element_class}">
 *       <span>{label}</span>
 *     </label>
 *     ...
 *   </div>
 *
 * Notes pinned by the reference fixtures:
 *   - name is the bracket key AS-IS (no [] appended; a spec key like
 *     "day[]" already carries its own [] suffix)
 *   - every input carries data-name / data-rule-name; NO data-default,
 *     NO data-is-default
 *   - ids have no random token: mchoice-{clean_key}{index}
 *   - no data-toggle and no role/aria on the container
 */

import React, { useCallback, useMemo } from 'react';
import type { FieldComponentProps, FormValue } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { useFormContext } from '../../context/FormContext';
import { toBracketNotationWithPrefix } from '../../utils/dataAttributes';
import { cleanStr, itemEntries, leafName, phpString, ruleNameForPath } from './limepieParity';

/**
 * MultichoiceField component
 */
export function MultichoiceField({
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

  // PHP: if (!$value) $value = []; if empty and default isset -> [(string)default]
  const selectedValues = useMemo((): string[] => {
    let values: string[];
    if (Array.isArray(value)) {
      values = value.map(String);
    } else if (value) {
      values = [String(value)];
    } else {
      values = [];
    }
    if (values.length === 0 && spec.default !== undefined && spec.default !== null) {
      values = Array.isArray(spec.default)
        ? (spec.default as unknown[]).map((d) => phpString(d))
        : [phpString(spec.default)];
    }
    return values;
  }, [value, spec.default]);

  const handleChange = useCallback(
    (optionValue: string, checked: boolean) => {
      if (disabled || readonly) return;

      let newValues: string[];

      if (checked) {
        // Add value
        newValues = [...selectedValues, optionValue];
      } else {
        // Remove value
        newValues = selectedValues.filter((v) => v !== optionValue);
      }

      onChange(newValues as FormValue);
    },
    [selectedValues, onChange, disabled, readonly]
  );

  // Parse items (ordered — itemEntries keeps the spec's entry order)
  const options = useMemo(() => {
    const items = spec.items;

    if (!items || typeof items !== 'object') {
      return [];
    }

    // Check if items is dynamic
    if (!Array.isArray(items) && 'model' in items) {
      return [];
    }

    return itemEntries(items).map(([key, label]) => ({
      value: key,
      label: t(label as string | Record<string, string>),
    }));
  }, [spec.items, t]);

  // PHP key: bracket name as-is. toBracketNotationWithPrefix() eats a
  // trailing "[]" segment suffix, so restore it from the leaf segment.
  const bracketBase = toBracketNotationWithPrefix(path, keyPrefix || undefined);
  const bracketName = leafName(path).endsWith('[]') ? `${bracketBase}[]` : bracketBase;

  // PHP id prefix: 'mchoice-' . clean_str($key) — index appended directly.
  const idPrefix = `mchoice-${cleanStr(bracketName)}`;

  const dataName = leafName(path);
  const dataRuleName = ruleNameForPath(path);

  return (
    <div className="btn-group flex-wrap btn-group-toggle">
      {options.map((option, index) => {
        const isChecked = selectedValues.includes(option.value);
        const inputId = `${idPrefix}${index + 1}`;

        return (
          <React.Fragment key={option.value}>
            <input
              type="checkbox"
              id={inputId}
              name={bracketName}
              value={option.value}
              checked={isChecked}
              onChange={(e) => handleChange(option.value, e.target.checked)}
              onBlur={index === options.length - 1 ? onBlur : undefined}
              disabled={disabled}
              autoComplete="off"
              className={`valid-target btn-check${error ? ' is-invalid' : ''}`}
              data-name={dataName}
              data-rule-name={dataRuleName}
            />
            <label
              htmlFor={inputId}
              className={`btn btn-switch btn-mswitch${spec.element_class ? ` ${spec.element_class as string}` : ''}`}
            >
              <span>{option.label}</span>
            </label>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default MultichoiceField;
