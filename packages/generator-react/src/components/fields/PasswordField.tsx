/**
 * PasswordField Component
 *
 * Password input field.
 *
 * Limepie PHP reference structure (Fields/Password.php) — a BARE input, no
 * input-group wrapper, no visibility toggle, no placeholder:
 *   <input type="password" class="valid-target form-control" name=".."
 *          data-name=".." data-rule-name=".." value="" data-default=".."
 *          [readonly] [autocomplete] />
 *
 * PHP always renders value="" (passwords are never echoed). React keeps the
 * live state value so typing works; the empty-data SSR render is identical.
 */

import React, { useCallback, type ChangeEvent } from 'react';
import type { FieldComponentProps } from '../../types';
import { useFormContext } from '../../context/FormContext';
import { toBracketNotationWithPrefix } from '../../utils/dataAttributes';
import { limepieDataAttrs } from './limepieParity';

/**
 * PasswordField component
 */
export function PasswordField({
  spec,
  value,
  onChange,
  onBlur,
  error,
  disabled,
  readonly,
  path,
}: FieldComponentProps) {
  const { keyPrefix } = useFormContext();

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotationWithPrefix(path, keyPrefix || undefined);

  return (
    <input
      type="password"
      name={bracketName}
      value={(value as string) ?? ''}
      onChange={handleChange}
      onBlur={onBlur}
      disabled={disabled}
      readOnly={readonly}
      className={error ? 'valid-target form-control is-invalid' : 'valid-target form-control'}
      autoComplete={spec.autocomplete as string | undefined}
      {...limepieDataAttrs(spec, path)}
    />
  );
}

export default PasswordField;
