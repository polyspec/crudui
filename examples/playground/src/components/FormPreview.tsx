import React, { useMemo, useCallback } from 'react';
import yaml from 'yaml';
import { FormBuilder } from '@form-spec/generator-react';
import type { FormData, FormErrors } from '@form-spec/generator-react';

interface FormPreviewProps {
  spec: string;
  language: 'ko' | 'en';
  onDataChange: (data: FormData) => void;
  onErrorsChange: (errors: FormErrors) => void;
}

export const FormPreview: React.FC<FormPreviewProps> = ({
  spec,
  language,
  onDataChange,
  onErrorsChange,
}) => {
  // Parse YAML spec
  const { parsedSpec, parseError } = useMemo(() => {
    try {
      const parsed = yaml.parse(spec);
      return { parsedSpec: parsed, parseError: null };
    } catch (error) {
      return {
        parsedSpec: null,
        parseError: error instanceof Error ? error.message : String(error),
      };
    }
  }, [spec]);

  // Handle form changes
  const handleChange = useCallback(
    (_name: string, _value: unknown, allData: FormData) => {
      onDataChange(allData);
    },
    [onDataChange]
  );

  // Handle validation
  const handleValidate = useCallback(
    (errors: FormErrors) => {
      onErrorsChange(errors);
    },
    [onErrorsChange]
  );

  // Handle form submit
  const handleSubmit = useCallback(
    (data: FormData, errors: FormErrors) => {
      onDataChange(data);
      onErrorsChange(errors);

      if (Object.keys(errors).length === 0) {
        console.log('Form submitted:', data);
      }
    },
    [onDataChange, onErrorsChange]
  );

  // Show parse error
  if (parseError) {
    return (
      <div className="parse-error">
        <div className="parse-error-title">YAML Parse Error</div>
        <div className="parse-error-message">{parseError}</div>
      </div>
    );
  }

  // Show empty state
  if (!parsedSpec || !parsedSpec.properties) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📝</div>
        <p>Enter a valid form spec in the editor</p>
      </div>
    );
  }

  return (
    <div className="form-preview">
      <FormBuilder
        spec={parsedSpec}
        language={language}
        onChange={handleChange}
        onValidate={handleValidate}
        onSubmit={handleSubmit}
      />
    </div>
  );
};
