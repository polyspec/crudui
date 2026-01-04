/**
 * FormBuilder Component
 *
 * Main form component that renders forms based on YAML spec
 */

import React, { useCallback, useMemo, type FormEvent } from 'react';
import yaml from 'yaml';
import type { Spec } from '@legacy/form-validator/legacy';
import { FormContextProvider, useFormContext } from '../context/FormContext';
import { I18nContextProvider, useI18n } from '../context/I18nContext';
import { FormField } from './FormField';
import { ButtonGroup } from './buttons/ButtonGroup';
import type {
  FormBuilderProps,
  FormData,
  FormErrors,
  FormValue,
  Language,
} from '../types';

/**
 * FormBuilder component
 */
export function FormBuilder({
  spec: specProp,
  data = {},
  language = 'ko',
  onSubmit,
  onChange,
  onValidate,
  className,
  disabled = false,
  readonly = false,
  customFields = {},
  renderWrapper,
  renderButtons,
}: FormBuilderProps) {
  /**
   * Parse spec if it's a YAML string
   */
  const spec = useMemo((): Spec => {
    if (typeof specProp === 'string') {
      try {
        return yaml.parse(specProp) as Spec;
      } catch (error) {
        console.error('Failed to parse YAML spec:', error);
        return { type: 'group', properties: {} };
      }
    }
    return specProp;
  }, [specProp]);

  return (
    <I18nContextProvider language={language}>
      <FormContextProvider
        spec={spec}
        initialData={data}
        disabled={disabled}
        readonly={readonly}
        customFields={customFields}
        onChange={onChange}
        onValidate={onValidate}
      >
        <FormBuilderInner
          className={className}
          onSubmit={onSubmit}
          renderWrapper={renderWrapper}
          renderButtons={renderButtons}
        />
      </FormContextProvider>
    </I18nContextProvider>
  );
}

/**
 * Inner form component with access to contexts
 */
interface FormBuilderInnerProps {
  className?: string;
  onSubmit?: (data: FormData, errors: FormErrors) => void;
  renderWrapper?: FormBuilderProps['renderWrapper'];
  renderButtons?: FormBuilderProps['renderButtons'];
}

function FormBuilderInner({
  className,
  onSubmit,
  renderWrapper,
  renderButtons,
}: FormBuilderInnerProps) {
  const { spec, data, validateForm, errors } = useFormContext();
  const { t } = useI18n();

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();

      const formErrors = validateForm();

      if (onSubmit) {
        onSubmit(data, formErrors);
      }
    },
    [validateForm, data, onSubmit]
  );

  /**
   * Check if form is valid
   */
  const isValid = Object.keys(errors).length === 0;

  /**
   * Render form fields
   */
  const renderFields = () => {
    if (!spec.properties) {
      return null;
    }

    return Object.entries(spec.properties).map(([name, fieldSpec]) => (
      <FormField key={name} name={name} spec={fieldSpec} path={name} />
    ));
  };

  /**
   * Render form content
   */
  const formContent = (
    <>
      {/* Form title - use label.form-label like Legacy */}
      {spec.label && <label className="form-label">{t(spec.label)}</label>}

      {/* Form description */}
      {spec.description && <div className="form-description">{t(spec.description)}</div>}

      {/* Separator like Legacy */}
      {(spec.label || spec.description) && <hr />}

      {/* Form fields - wrapped in form-group like Legacy */}
      <div className="form-group">{renderFields()}</div>

      {/* Form buttons */}
      {renderButtons ? (
        renderButtons({ spec, isSubmitting: false, isValid })
      ) : (
        <ButtonGroup spec={spec} isSubmitting={false} isValid={isValid} />
      )}
    </>
  );

  /**
   * Render with custom wrapper or default form
   */
  if (renderWrapper) {
    return renderWrapper({
      children: formContent,
      spec,
      onSubmit: handleSubmit,
    });
  }

  return (
    <form
      className={className ? `form-builder ${className}` : 'form-builder'}
      onSubmit={handleSubmit}
      noValidate
    >
      {formContent}
    </form>
  );
}

export default FormBuilder;
