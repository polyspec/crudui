/**
 * SelectField Component
 *
 * Dropdown select field
 */

import React, { useCallback, useMemo, type ChangeEvent } from 'react';
import type { FieldComponentProps } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { getLimepieDataAttributes, toBracketNotation, getSelectClasses } from '../../utils/dataAttributes';

/**
 * SelectField component
 */
export function SelectField({
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
    if (typeof items === 'object' && 'model' in items) {
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

    for (const [key, val] of Object.entries(items)) {
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
  const bracketName = toBracketNotation(path);

  return (
    <div className="input-group">
      {/* Prepend */}
      {spec.prepend && (
        <span className="input-group-text" dangerouslySetInnerHTML={{ __html: spec.prepend }} />
      )}

      <select
        id={path}
        name={bracketName}
        value={(value as string) ?? ''}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled || readonly}
        className={getSelectClasses(spec, !!error)}
        autoFocus={spec.autofocus === true}
        {...getLimepieDataAttributes(spec, path, language)}
      >
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
    </div>
  );
}

export default SelectField;
