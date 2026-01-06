/**
 * HiddenField Component
 *
 * Hidden input field
 */

import React from 'react';
import type { FieldComponentProps } from '../../types';
import { useFormContext } from '../../context/FormContext';
import { getLimepieDataAttributes, toBracketNotationWithPrefix } from '../../utils/dataAttributes';

/**
 * HiddenField component
 */
export function HiddenField({
  name,
  spec,
  value,
  path,
  language,
}: FieldComponentProps) {
  const { keyPrefix } = useFormContext();

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotationWithPrefix(path, keyPrefix || undefined);

  return (
    <input
      type="hidden"
      id={path}
      name={bracketName}
      value={(value as string) ?? (spec.default as string) ?? ''}
      {...getLimepieDataAttributes(spec, path, language)}
    />
  );
}

export default HiddenField;
