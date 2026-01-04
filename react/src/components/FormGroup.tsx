/**
 * FormGroup Component
 *
 * Handles nested groups and multiple/sortable array fields
 */

import React, { useCallback, useMemo } from 'react';
import { useFormContext } from '../context/FormContext';
import { useI18n } from '../context/I18nContext';
import { useMultiple, arrayToMultipleItems, multipleItemsToArray } from '../hooks/useMultiple';
import { FormField } from './FormField';
import { Label } from './common/Label';
import { ErrorMessage } from './common/ErrorMessage';
import { Description } from './common/Description';
import type { FormValue, FormData, MultipleItem, FieldSpec, MultiLangText } from '../types';
import { getValueByPath, setValueByPath, joinPath, generateUniqueKey } from '../utils/path';

/**
 * FormGroup props
 */
interface FormGroupProps {
  /** Group name */
  name: string;
  /** Group specification */
  spec: FieldSpec;
  /** Full path in form data */
  path: string;
  /** Parent path for nested fields */
  parentPath?: string;
  /** Index in array (for multiple fields) */
  index?: number;
  /** Unique key for array items */
  uniqueKey?: string;
}

/**
 * FormGroup component
 */
export function FormGroup({
  name,
  spec,
  path,
  parentPath,
  index,
  uniqueKey,
}: FormGroupProps) {
  const { getValue, setValue, errors, disabled: globalDisabled, readonly: globalReadonly } = useFormContext();
  const { t } = useI18n();

  // Get group label
  const label = spec.label ? t(spec.label) : undefined;

  // Get error for group level
  const error = errors[path];

  // Check if multiple
  const isMultiple = spec.multiple === true;

  // If multiple, render multiple items
  if (isMultiple) {
    return (
      <MultipleFormGroup
        name={name}
        spec={spec}
        path={path}
        parentPath={parentPath}
        label={label}
        error={error}
      />
    );
  }

  // Single group
  const wrapperClasses = ['form-group'];
  if (spec.class) {
    wrapperClasses.push(spec.class);
  }
  if (error) {
    wrapperClasses.push('form-group--error');
  }

  return (
    <div className={wrapperClasses.join(' ')}>
      {/* Group label */}
      {label && (
        <Label className="form-group__label" required={Boolean(spec.rules?.required)}>
          {label}
        </Label>
      )}

      {/* Group description */}
      {spec.description && <Description text={t(spec.description)} />}

      {/* Group fields */}
      <div className="form-group__fields">
        {spec.properties &&
          Object.entries(spec.properties).map(([fieldName, fieldSpec]) => (
            <FormField
              key={fieldName}
              name={fieldName}
              spec={fieldSpec}
              path={joinPath(path, fieldName)}
              parentPath={path}
            />
          ))}
      </div>

      {/* Group error */}
      {error && <ErrorMessage message={error} />}
    </div>
  );
}

/**
 * Multiple FormGroup component
 */
interface MultipleFormGroupProps {
  name: string;
  spec: FieldSpec;
  path: string;
  parentPath?: string;
  label?: string;
  error?: string;
}

function MultipleFormGroup({
  name,
  spec,
  path,
  parentPath,
  label,
  error,
}: MultipleFormGroupProps) {
  const { getValue, setValue, disabled: globalDisabled, readonly: globalReadonly } = useFormContext();
  const { t } = useI18n();

  // Get current array value
  const currentValue = getValue(path);
  const arrayValue = useMemo(() => {
    if (Array.isArray(currentValue)) {
      return currentValue;
    }
    if (typeof currentValue === 'object' && currentValue !== null) {
      // Object with unique keys - convert to array
      const entries = Object.entries(currentValue as Record<string, FormValue>);
      return entries.map(([, value]) => value);
    }
    return [];
  }, [currentValue]);

  // Use multiple hook
  const {
    items,
    add,
    remove,
    move,
    canAdd,
    canRemove,
  } = useMultiple<FormData>({
    initialItems: arrayValue as FormData[],
    min: spec.min as number | undefined,
    max: spec.max as number | undefined,
    defaultValue: () => {
      // Create default values from properties
      const defaults: FormData = {};
      if (spec.properties) {
        for (const [fieldName, fieldSpec] of Object.entries(spec.properties)) {
          if (fieldSpec.default !== undefined) {
            defaults[fieldName] = fieldSpec.default as FormValue;
          }
        }
      }
      return defaults;
    },
    onChange: (newItems) => {
      // Convert items to object with unique keys
      const newValue: Record<string, FormData> = {};
      for (const item of newItems) {
        newValue[item.key] = item.value;
      }
      setValue(path, newValue as FormValue);
    },
  });

  // Handle add button
  const handleAdd = useCallback(() => {
    add();
  }, [add]);

  // Handle remove button
  const handleRemove = useCallback(
    (key: string) => {
      remove(key);
    },
    [remove]
  );

  // Handle move up
  const handleMoveUp = useCallback(
    (currentIndex: number) => {
      if (currentIndex > 0) {
        move(currentIndex, currentIndex - 1);
      }
    },
    [move]
  );

  // Handle move down
  const handleMoveDown = useCallback(
    (currentIndex: number) => {
      if (currentIndex < items.length - 1) {
        move(currentIndex, currentIndex + 1);
      }
    },
    [move, items.length]
  );

  // Is sortable
  const isSortable = spec.sortable === true;

  // Is disabled or readonly
  const isDisabled = globalDisabled || spec.disabled === true;
  const isReadonly = globalReadonly || spec.readonly === true;

  // Wrapper classes
  const wrapperClasses = ['form-group', 'form-group--multiple'];
  if (spec.class) {
    wrapperClasses.push(spec.class);
  }
  if (error) {
    wrapperClasses.push('form-group--error');
  }

  // Button labels
  const addButtonLabel = spec.add_button_label ? t(spec.add_button_label) : t('add');
  const removeButtonLabel = spec.remove_button_label ? t(spec.remove_button_label) : t('remove');

  return (
    <div className={wrapperClasses.join(' ')}>
      {/* Group label */}
      {label && (
        <Label className="form-group__label" required={Boolean(spec.rules?.required)}>
          {label}
        </Label>
      )}

      {/* Group description */}
      {spec.description && <Description text={t(spec.description)} />}

      {/* Multiple items */}
      <div className="form-group__items">
        {items.map((item, index) => (
          <div key={item.key} className="form-group__item">
            {/* Item header with controls */}
            <div className="form-group__item-header">
              <span className="form-group__item-index">{index + 1}</span>

              {/* Sortable controls */}
              {isSortable && !isDisabled && !isReadonly && (
                <div className="form-group__item-sort">
                  <button
                    type="button"
                    className="form-group__sort-btn form-group__sort-btn--up"
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    aria-label={t('moveUp')}
                  >
                    &#9650;
                  </button>
                  <button
                    type="button"
                    className="form-group__sort-btn form-group__sort-btn--down"
                    onClick={() => handleMoveDown(index)}
                    disabled={index === items.length - 1}
                    aria-label={t('moveDown')}
                  >
                    &#9660;
                  </button>
                </div>
              )}

              {/* Remove button */}
              {canRemove && !isDisabled && !isReadonly && (
                <button
                  type="button"
                  className="form-group__remove-btn"
                  onClick={() => handleRemove(item.key)}
                  aria-label={removeButtonLabel}
                >
                  {removeButtonLabel}
                </button>
              )}
            </div>

            {/* Item fields */}
            <div className="form-group__item-fields">
              {spec.properties &&
                Object.entries(spec.properties).map(([fieldName, fieldSpec]) => (
                  <FormField
                    key={fieldName}
                    name={fieldName}
                    spec={fieldSpec}
                    path={joinPath(path, item.key, fieldName)}
                    parentPath={joinPath(path, item.key)}
                    index={index}
                    uniqueKey={item.key}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>

      {/* Add button */}
      {canAdd && !isDisabled && !isReadonly && (
        <button type="button" className="form-group__add-btn" onClick={handleAdd}>
          {addButtonLabel}
        </button>
      )}

      {/* Group error */}
      {error && <ErrorMessage message={error} />}
    </div>
  );
}

export default FormGroup;
