/**
 * TinymceField Component
 *
 * Legacy PHP reference structure (Fields/Tinymce.php) — a textarea plus the
 * legacy bootstrap <script>:
 *
 *   <textarea id="tinymce{uniqid}" class="valid-target form-control tinymcearea"
 *             name=".." data-type="{spec.type}" data-height="{height}"
 *             data-upload-server="{fileserver}" data-name=".."
 *             data-rule-name=".." data-default=".." rows="{rows}">{value}</textarea>
 *   <script nonce="">$(function() {editor_tinymce('#tinymce{uniqid}', {height},
 *           '{fileserver}', {readonly});});</script>
 *
 * The nonce is the legacy CSP session nonce — the reference baseline renders it
 * empty (tools/legacy-baseline/render.php pins $_SESSION['nonce'] = '').
 * Actual TinyMCE integration belongs to the host page JS (editor_tinymce),
 * exactly like the legacy runtime.
 */

import React, { useCallback, useRef, type ChangeEvent } from 'react';
import type { FieldComponentProps } from '../../types';
import { useFormContext } from '../../context/FormContext';
import { generateUniqid, toBracketNotationWithPrefix } from '../../utils/dataAttributes';
import { applyDefaultString, legacyDataAttrs } from './legacyParity';

/**
 * TinymceField component
 */
export function TinymceField({
  spec,
  value,
  onChange,
  onBlur,
  disabled,
  readonly,
  path,
}: FieldComponentProps) {
  const { keyPrefix } = useFormContext();

  // PHP: $id = \uniqid() — bare 13-hex (generateUniqid() wraps in "__").
  const idRef = useRef<string>(generateUniqid().slice(2, -2));

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  const bracketName = toBracketNotationWithPrefix(path, keyPrefix || undefined);

  // PHP fallbacks: rows ?? 3, height ?? 300, fileserver ?? 'upload'.
  const rows = (spec.rows as number | undefined) ?? 3;
  const height = (spec as Record<string, unknown>).height ?? 300;
  const upload = ((spec as Record<string, unknown>).fileserver as string | undefined) ?? 'upload';
  const readonlyJs = spec.readonly !== undefined ? (spec.readonly ? 'true' : 'false') : 'false';
  const displayValue = applyDefaultString(value, spec.default);
  const editorId = `tinymce${idRef.current}`;

  return (
    <>
      <textarea
        id={editorId}
        className="valid-target form-control tinymcearea"
        name={bracketName}
        value={displayValue}
        onChange={handleChange}
        onBlur={onBlur}
        disabled={disabled}
        readOnly={readonly}
        rows={rows}
        data-type={spec.type ?? 'tinymce'}
        data-height={String(height)}
        data-upload-server={upload}
        {...legacyDataAttrs(spec, path)}
      />
      <script
        nonce=""
        dangerouslySetInnerHTML={{
          __html: `$(function() {editor_tinymce('#${editorId}', ${String(height)}, '${upload}', ${readonlyJs});});`,
        }}
      />
    </>
  );
}

export default TinymceField;
