/**
 * ImageField Component
 *
 * Legacy PHP reference structure (Fields/Image.php) — a legacy file
 * input-group, NOT a styled preview widget:
 *
 *   <div class="input-group">
 *     [<span class="input-group-text{prepend_class}">{prepend}</span>]
 *     <input type="text" class="form-control form-control-file" value=""
 *            readonly="readonly" />
 *     <input type="file" class="valid-target form-control-file form-control-image"
 *            data-max-width=".." data-min-width=".." data-max-height=".."
 *            data-min-height=".." data-preview-max-width=".."
 *            data-preview-max-height=".." name=".." data-name=".."
 *            data-rule-name=".." value="" accept=".." />
 *     <button class="btn btn-search btn-file-search" type="button">&nbsp;</button>
 *     [multiple-row move/plus/minus buttons]
 *   </div>
 *
 * The file input carries NO data-default; the size data-* attributes default
 * to 0. The btn-search button always renders at the legacy `<!--btn-->` slot
 * (Fields::addElement str_replace), BEFORE the multiple-row buttons.
 *
 * The row renders raw (dangerouslySetInnerHTML): React refuses value="" on
 * file inputs and the multiple-row buttons may carry inline onclick
 * attributes. Interactivity is delegated: btn-search clicks open the file
 * dialog, file changes propagate through onChange, row-button clicks go to
 * onButtonsClick (FormField/FormGroup delegation pattern).
 *
 * Uploaded-value rows (legacy arr::is_file_array data — {name, url, ...})
 * render the readonly name input, per-key hidden clone-element inputs and
 * the sibling .form-preview block, like Image::write's file-array branch.
 */

import React, { useCallback, type ChangeEvent, type MouseEvent } from 'react';
import type { FieldComponentProps, FormValue } from '../../types';
import { useFormContext } from '../../context/FormContext';
import { toBracketNotationWithPrefix } from '../../utils/dataAttributes';
import { escAttr, leafName, phpString, ruleNameForPath } from './legacyParity';

/** Data keys the legacy file-array branch serializes (Image::write). */
const FILE_ARRAY_KEYS = [
  'name',
  'type',
  'size',
  'tmp_name',
  'error',
  'full_path',
  'file_name_alias_seq',
  'url',
] as const;

/** arr::is_file_array($data, false) approximation for spec-shaped values. */
function isFileArrayValue(value: FormValue): value is Record<string, FormValue> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).name === 'string' &&
    ('url' in value || 'size' in value || 'tmp_name' in value)
  );
}

/**
 * ImageField component
 */
export function ImageField({
  spec,
  value,
  onChange,
  path,
  language,
  buttonsHtml,
  onButtonsClick,
}: FieldComponentProps) {
  const { keyPrefix } = useFormContext();

  const bracketName = toBracketNotationWithPrefix(path, keyPrefix || undefined);
  const specRec = spec as Record<string, unknown>;

  // PHP: accept from rules.accept, size limits ?? 0.
  const rules = (spec.rules ?? {}) as Record<string, unknown>;
  const accept = typeof rules.accept === 'string' ? rules.accept : 'image/*';
  const maxWidth = phpString(specRec['max-width']) || '0';
  const minWidth = phpString(specRec['min-width']) || '0';
  const maxHeight = phpString(specRec['max-height']) || '0';
  const minHeight = phpString(specRec['min-height']) || '0';
  const viewWidth = phpString(specRec['preview-max-width']) || '0';
  const viewHeight = phpString(specRec['preview-max-height']) || '0';

  // prepend span (localized when given as a language map).
  let prependHtml = '';
  if (specRec.prepend) {
    const prependClass = specRec.prepend_class ? ` ${String(specRec.prepend_class)}` : '';
    let prependText: string;
    if (
      specRec.prepend !== null &&
      typeof specRec.prepend === 'object' &&
      !Array.isArray(specRec.prepend)
    ) {
      prependText = phpString((specRec.prepend as Record<string, unknown>)[language]);
    } else {
      prependText = phpString(specRec.prepend);
    }
    prependHtml = `<span class="input-group-text${escAttr(prependClass)}">${prependText}</span>`;
  }

  const sizeAttrs =
    ` data-max-width="${escAttr(maxWidth)}" data-min-width="${escAttr(minWidth)}"` +
    ` data-max-height="${escAttr(maxHeight)}" data-min-height="${escAttr(minHeight)}"` +
    ` data-preview-max-width="${escAttr(viewWidth)}" data-preview-max-height="${escAttr(viewHeight)}"`;
  const validAttrs =
    ` data-name="${escAttr(leafName(path))}" data-rule-name="${escAttr(ruleNameForPath(path))}"`;

  // Delegated interactivity over the raw markup.
  const handleClick = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      const btn = (e.target as Element).closest?.('button');
      if (btn?.classList.contains('btn-file-search')) {
        e.currentTarget
          .querySelector<HTMLInputElement>('input[type="file"]')
          ?.click();
        return;
      }
      onButtonsClick?.(e);
    },
    [onButtonsClick]
  );
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const target = e.target as HTMLInputElement;
      if (target.type === 'file') {
        const file = target.files?.[0];
        onChange((file as FormValue) ?? null);
      }
    },
    [onChange]
  );

  const fileArray = isFileArrayValue(value) ? value : null;

  if (fileArray) {
    // Legacy file-array branch: readonly name + per-key hidden clone inputs.
    const fileName = phpString(fileArray.name);
    let html =
      `<div class="input-group">${prependHtml}` +
      `<input type="text" class="form-control form-control-file" value="${escAttr(fileName)}" readonly="readonly" />`;
    for (const key of FILE_ARRAY_KEYS) {
      if (!(key in fileArray)) continue;
      if (key === 'name') {
        html +=
          `<input type="text" class="valid-target form-control-file form-control-filetext form-control-image"` +
          `${sizeAttrs} name="${escAttr(bracketName)}[name]"${validAttrs}` +
          ` value="${escAttr(fileName)}" accept="${escAttr(accept)}" />`;
      } else if (key !== 'tmp_name') {
        html +=
          `<input type="hidden" class="clone-element" name="${escAttr(bracketName)}[${key}]"` +
          ` value="${escAttr(phpString(fileArray[key]))}" />`;
      }
    }
    html +=
      '<button class="btn btn-search btn-file-search-text" type="button">&nbsp;</button>' +
      (buttonsHtml ?? '') +
      '</div>';
    const url = phpString(fileArray.url);
    const previewStyle = viewWidth !== '0' ? ` style="max-width:${escAttr(viewWidth)}px"` : '';
    html +=
      `<div class="form-preview clone-element"><div><a href="${escAttr(url)}" target="_new">` +
      `<img${previewStyle} src="${escAttr(url)}" class="form-preview-image"></a></div></div>`;
    return (
      <div
        onClick={handleClick}
        onChange={handleChange}
        dangerouslySetInnerHTML={{ __html: html }}
        style={{ display: 'contents' }}
      />
    );
  }

  // Empty branch — verbatim Image::write else-side markup.
  const html =
    prependHtml +
    '<input type="text" class="form-control form-control-file" value="" readonly="readonly" />' +
    `<input type="file" class="valid-target form-control-file form-control-image"${sizeAttrs}` +
    ` name="${escAttr(bracketName)}"${validAttrs} value="" accept="${escAttr(accept)}" />` +
    '<button class="btn btn-search btn-file-search" type="button">&nbsp;</button>' +
    (buttonsHtml ?? '');

  return (
    <div
      className="input-group"
      onClick={handleClick}
      onChange={handleChange}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default ImageField;
