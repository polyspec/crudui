/**
 * FormField Component
 *
 * Field dispatcher that renders appropriate field component based on type
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFormContext } from '../context/FormContext';
import { useI18n } from '../context/I18nContext';
import { useConditional } from '../hooks/useConditional';
import { FormGroup } from './FormGroup';
import { Label } from './common/Label';
import { ErrorMessage } from './common/ErrorMessage';
import { Description } from './common/Description';
import { getFieldComponent } from './fields';
import { generateUniqid } from '../utils/dataAttributes';
import type { FormValue, Language, FieldComponentProps, AllOfCondition, AllOfResult, FieldSpec, MultiLangText } from '../types';

/**
 * FormField props
 */
interface FormFieldProps {
  /** Field name */
  name: string;
  /** Field specification */
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
 * FormField component
 */
export function FormField({
  name,
  spec,
  path,
  parentPath,
  index,
  uniqueKey,
}: FormFieldProps) {
  const {
    getValue,
    setValue,
    errors,
    validateField,
    isFieldVisible,
    registerField,
    unregisterField,
    disabled: globalDisabled,
    readonly: globalReadonly,
    customFields,
    keyPrefix,
  } = useFormContext();
  const { language, t } = useI18n();
  const { evaluateAllOf } = useConditional({ path });

  // Generate stable uniqid for this field (like PHP's data-uniqid)
  const uniqidRef = useRef<string>(generateUniqid());

  // Register/unregister field
  useEffect(() => {
    registerField(path);
    return () => unregisterField(path);
  }, [path, registerField, unregisterField]);

  // Check visibility
  const visible = useMemo(() => isFieldVisible(path), [isFieldVisible, path]);

  // Evaluate element.all_of for styling
  const allOfResult = useMemo((): AllOfResult | null => {
    if (spec.element?.all_of) {
      return evaluateAllOf(spec.element.all_of as AllOfCondition);
    }
    return null;
  }, [spec.element, evaluateAllOf]);

  // Get current value
  const value = getValue(path);

  // Get error message
  const error = errors[path];

  // Determine disabled/readonly state
  const isDisabled = globalDisabled || spec.disabled === true;
  const isReadonly = globalReadonly || spec.readonly === true;

  // Handle value change
  const handleChange = useCallback(
    (newValue: FormValue) => {
      setValue(path, newValue);
    },
    [path, setValue]
  );

  // Handle blur (validate)
  const handleBlur = useCallback(() => {
    validateField(path);
  }, [path, validateField]);

  // Don't render if not visible
  if (!visible) {
    return null;
  }

  // Handle group type
  if (spec.type === 'group' && spec.properties) {
    return (
      <FormGroup
        name={name}
        spec={spec}
        path={path}
        parentPath={parentPath}
        index={index}
        uniqueKey={uniqueKey}
      />
    );
  }

  // Get field component
  const FieldComponent = customFields[spec.type] ?? getFieldComponent(spec.type);

  if (!FieldComponent) {
    console.warn(`Unknown field type: ${spec.type}`);
    return null;
  }

  // Build wrapper class - matches Limepie form-element-wrapper exactly
  const wrapperClasses = ['form-element-wrapper'];
  if (spec.wrapper_class) {
    wrapperClasses.push(spec.wrapper_class);
  }
  if (allOfResult?.className) {
    wrapperClasses.push(allOfResult.className);
  }

  // Build wrapper style
  const wrapperStyle: React.CSSProperties = {};
  if (allOfResult?.style) {
    // Parse inline style string
    const styleEntries = allOfResult.style.split(';').filter(Boolean);
    for (const entry of styleEntries) {
      const [key, val] = entry.split(':').map((s) => s.trim());
      if (key && val) {
        const camelKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        (wrapperStyle as Record<string, string>)[camelKey] = val;
      }
    }
  }

  // Prepare field props
  const fieldProps: FieldComponentProps = {
    name,
    spec,
    value,
    onChange: handleChange,
    onBlur: handleBlur,
    error,
    disabled: isDisabled,
    readonly: isReadonly,
    language: language as Language,
    path,
    parentPath,
    index,
    uniqueKey,
  };

  // Get translated label
  const label = spec.label ? t(spec.label) : undefined;

  // Build wrapper name attribute (like PHP: "product.basic.name-layer")
  const wrapperName = keyPrefix ? `${keyPrefix}.${path}-layer` : `${path}-layer`;

  // Checkbox has completely different structure in PHP Limepie
  if (spec.type === 'checkbox' || spec.type === 'switcher') {
    return (
      <div className={wrapperClasses.join(' ')} style={wrapperStyle} {...{ name: wrapperName }}>
        <div className="checkbox">
          <h6>
            <div data-uniqid={uniqidRef.current} className="input-group-wrapper" style={{}}>
              <FieldComponent {...fieldProps} />
            </div>
          </h6>
        </div>
        {/* Error message */}
        {error && <ErrorMessage message={error} />}
      </div>
    );
  }

  return (
    <div className={wrapperClasses.join(' ')} style={wrapperStyle} {...{ name: wrapperName }}>
      {/* Label - use h6 to match Limepie original */}
      {label && spec.type !== 'hidden' && (
        <h6 className="">{label}</h6>
      )}

      {/* Description */}
      {spec.description && <Description text={t(spec.description)} />}

      {/* form-element > input-group-wrapper structure like Limepie */}
      <div className="form-element">
        <div data-uniqid={uniqidRef.current} className="input-group-wrapper" style={{}}>
          {/* Field component */}
          <FieldComponent {...fieldProps} />
        </div>
      </div>

      {/* Error message */}
      {error && <ErrorMessage message={error} />}
    </div>
  );
}

export default FormField;
