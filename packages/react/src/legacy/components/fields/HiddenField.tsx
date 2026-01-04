/**
 * HiddenField Component
 *
 * Hidden input field
 */

import React from 'react';
import type { FieldComponentProps } from '../../types';
import { getLimepieDataAttributes, toBracketNotation } from '../../utils/dataAttributes';

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
  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotation(path);

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
