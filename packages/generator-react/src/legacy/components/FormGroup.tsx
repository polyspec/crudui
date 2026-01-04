/**
 * FormGroup Component
 *
 * Handles nested groups and multiple/sortable array fields
 */

import React, { useCallback, useMemo } from 'react';
import { Plus, Minus, ChevronUp, ChevronDown } from 'lucide-react';
import { useFormContext } from '../context/FormContext';
import { useI18n } from '../context/I18nContext';
import { useMultiple, arrayToMultipleItems, multipleItemsToArray } from '../hooks/useMultiple';
import { FormField } from './FormField';
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

  // Single group - matches Limepie original output exactly
  const wrapperClasses = ['form-element-wrapper', spec.class || ''].filter(Boolean);

  return (
    <div className={wrapperClasses.join(' ')} style={{}} data-name={`${path}-layer`}>
      {/* Group label - use h6 to match Limepie original */}
      {label && (
        <h6 className="">{label}</h6>
      )}

      {/* Group description */}
      {spec.description && <Description text={t(spec.description)} />}

      {/* form-element > input-group-wrapper > form-group structure like Limepie */}
      <div className="form-element">
        <div className="input-group-wrapper" style={{}}>
          <div className="form-group">{spec.properties && Object.entries(spec.properties).map(([fieldName, fieldSpec]) => (
            <FormField
              key={fieldName}
              name={fieldName}
              spec={fieldSpec}
              path={joinPath(path, fieldName)}
              parentPath={path}
            />
          ))}</div>
        </div>
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

  // Handle add after specific index
  const handleAddAfter = useCallback(
    (afterIndex: number) => {
      add(afterIndex + 1);
    },
    [add]
  );

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
  const wrapperClasses = ['form-element-wrapper', spec.class || ''].filter(Boolean);

  return (
    <div className={wrapperClasses.join(' ')} style={{}} data-name={`${path}-layer`}>
      {/* Group label */}
      {label && (
        <div className="d-flex justify-content-between align-items-center">
          <h6 className="">{label}</h6>
        </div>
      )}

      {/* Add button when empty - card style for consistency */}
      {items.length === 0 && canAdd && !isDisabled && !isReadonly && (
        <div className="card">
          <div className="card-header d-flex justify-content-between align-items-center py-2">
            <span></span>
            <button type="button" className="btn btn-outline-primary btn-sm" onClick={handleAdd}>
              <Plus size={16} className="me-1" />
              {t('add')}
            </button>
          </div>
        </div>
      )}

      {/* Group description */}
      {spec.description && <Description text={t(spec.description)} />}

      {/* form-element > input-group-wrapper > form-group structure (original Limepie) */}
      <div className="form-element">
        <div className="input-group-wrapper" style={{}}>
          <div className="form-group multiple-items">{items.map((item, index) => (
            <div key={item.key} className="card">
              {/* Item header with controls */}
              <div className="card-header d-flex justify-content-between align-items-center py-2">
                <span className="badge bg-secondary">{index + 1}</span>

                <div className="btn-group btn-group-sm">
                  {/* Add button - adds new item after this one */}
                  {canAdd && !isDisabled && !isReadonly && (
                    <button
                      type="button"
                      className="btn btn-outline-primary"
                      onClick={() => handleAddAfter(index)}
                    ><Plus size={16} /></button>
                  )}

                  {/* Sortable controls */}
                  {isSortable && !isDisabled && !isReadonly && (
                    <>
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0}
                      ><ChevronUp size={16} /></button>
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={() => handleMoveDown(index)}
                        disabled={index === items.length - 1}
                      ><ChevronDown size={16} /></button>
                    </>
                  )}

                  {/* Remove button */}
                  {canRemove && !isDisabled && !isReadonly && (
                    <button
                      type="button"
                      className="btn btn-outline-danger"
                      onClick={() => handleRemove(item.key)}
                    ><Minus size={16} /></button>
                  )}
                </div>
              </div>

              {/* Item fields */}
              <div className="card-body">{spec.properties &&
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
                ))}</div>
            </div>
          ))}</div>
        </div>
      </div>

      {/* Group error */}
      {error && <ErrorMessage message={error} />}
    </div>
  );
}

export default FormGroup;
