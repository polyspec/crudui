/**
 * SearchField Component
 *
 * Legacy PHP golden structure (Fields/Search.php) — a select2-driven
 * <select> with its CSP-nonce'd bootstrap <style>/<script> siblings:
 *
 *   <style nonce="">.{id}_select2 .loading-results { display: none; }</style>
 *   <script nonce="">$(function() {select2('{id}', '{kml}', '{delay}',
 *           '{containerClass}');[callback]});</script>
 *   <div class="input-group field-search">
 *     [<span class="input-group-text {prepend_class}">{prepend}</span>]
 *     <select class="valid-target form-control{element_class}" name=".."
 *             data-class="{containerClass}" data-keyword-min-length=".."
 *             data-delay=".." data-api-server="{minified js}" data-name=".."
 *             data-rule-name=".." id="{id}" [onchange] data-default="..">
 *       {options | <option value="">select</option> when items unset}
 *     </select>
 *     [<span class="input-group-text">{append}</span>]
 *   </div>
 *
 * id = clean_str($key) . '_' . uniqid(). containerClass keeps its LEADING
 * space (' input-group-first input-group-last') — it is part of the golden
 * data-class/select2() argument contract.
 *
 * The select content renders raw (dangerouslySetInnerHTML): legacy search
 * fields are select2/jQuery surface (option selected=""/inline onchange
 * attributes), not React-controlled inputs — same stance as ChoiceField's
 * inline-JS branch.
 */

import React, { useRef } from 'react';
import type { FieldComponentProps } from '../../types';
import { useFormContext } from '../../context/FormContext';
import { generateUniqid, toBracketNotationWithPrefix } from '../../utils/dataAttributes';
import { minifyJs } from '../../hooks/legacyDisplay';
import {
  cleanStr,
  escAttr,
  escText,
  itemEntries,
  leafName,
  phpString,
  ruleNameForPath,
} from './legacyParity';

/** Localized item text (PHP: $itemText[get_language()] when array). */
function itemText(v: unknown, language: string): string {
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    const localized = (v as Record<string, unknown>)[language];
    if (typeof localized === 'string') return localized;
  }
  return phpString(v);
}

/**
 * SearchField component
 */
export function SearchField({
  spec,
  value,
  disabled,
  readonly,
  path,
  language,
}: FieldComponentProps) {
  const { keyPrefix } = useFormContext();

  // PHP: $id = clean_str($key) . '_' . uniqid() — bare 13-hex.
  const uniqRef = useRef<string>(generateUniqid().slice(2, -2));

  const bracketName = toBracketNotationWithPrefix(path, keyPrefix || undefined);
  const id = `${cleanStr(bracketName)}_${uniqRef.current}`;

  const specRec = spec as Record<string, unknown>;

  // PHP `isset && truthy` fallbacks.
  const keywordMinLength = specRec.keyword_min_length ? String(specRec.keyword_min_length) : '2';
  const hideSearching = specRec.hide_searching !== undefined && !specRec.hide_searching ? false : true;
  const delay = specRec.delay ? String(specRec.delay) : '250';
  // NOTE: PHP computes a $placeholder fallback but never emits it — omitted.

  const apiServer =
    typeof specRec.api_server === 'string' && specRec.api_server
      ? minifyJs(specRec.api_server)
      : '';

  // PHP: empty value falls back to (string)$property['default'].
  const effectiveValue = (() => {
    const v = phpString(value);
    return v.length === 0 ? phpString(spec.default) : v;
  })();

  // readonly appends the legacy pointer-events style chain to element_style.
  let elementStyle = typeof specRec.element_style === 'string' ? specRec.element_style : '';
  if (spec.readonly || readonly) {
    elementStyle +=
      "-webkit-appearance: none; -moz-appearance: none; text-indent: 1px;text-overflow: ''; pointer-events: none;";
  }
  const styleAttr = elementStyle ? ` style="${escAttr(elementStyle)}"` : '';

  const elementClass = specRec.element_class ? ` ${String(specRec.element_class)}` : '';
  const globalDisabledAttr = spec.disabled || disabled ? 'disabled="disabled"' : '';
  const disables = Array.isArray(specRec.disables) ? specRec.disables.map(String) : [];

  // prepend / append spans.
  let prependHtml = '';
  if (specRec.prepend) {
    const prependClass = specRec.prepend_class ? ` ${String(specRec.prepend_class)}` : '';
    const prependText = itemText(specRec.prepend, language);
    prependHtml = `<span class="input-group-text ${prependClass}">${prependText}</span>`;
  }
  let appendHtml = '';
  if (specRec.append) {
    appendHtml = `<span class="input-group-text">${String(specRec.append)}</span>`;
  }

  // PHP container class — leading space is part of the contract.
  let containerClass = '';
  if (!prependHtml) containerClass += ' input-group-first';
  if (!appendHtml && !specRec.multiple) containerClass += ' input-group-last';

  // Options (Search.php items loop; `items` unset -> the single
  // <option value="">select</option> placeholder).
  let optionHtml = '';
  if (specRec.items !== undefined && specRec.items !== null) {
    // itemEntries keeps the spec's entry order (ordered pair form supported)
    for (const [itemKey, itemValue] of itemEntries(specRec.items)) {
      let coverUrl = '';
      let text: string;
      let prependText = '';
      let appendText = '';
      let optionClass = '';
      if (itemValue !== null && typeof itemValue === 'object' && 'id' in (itemValue as object)) {
        const o = itemValue as Record<string, unknown>;
        coverUrl = phpString(o.cover_url);
        text = itemText(o.text, language);
        prependText = phpString(o.prepend_text);
        appendText = phpString(o.append_text);
        if (o.class) optionClass = ` ${String(o.class)}`;
      } else {
        text = itemText(itemValue, language);
      }
      const optionDisabled = disables.includes(itemKey)
        ? 'disabled="disabled"'
        : globalDisabledAttr;
      const selected = effectiveValue === String(itemKey);
      optionHtml +=
        `<option data-prepend-text="${escAttr(prependText)}" data-append-text="${escAttr(appendText)}"` +
        ` data-cover-url="${escAttr(coverUrl)}" value="${escAttr(itemKey)}"` +
        (selected ? ' selected="selected"' : ' ') +
        `${optionDisabled} data-class="${escAttr(optionClass)}">${escText(text)}</option>`;
    }
  } else {
    optionHtml = '<option value="">select</option>';
  }

  // Inline onchange / legacy readonly select lock.
  let onchangeAttr = '';
  if (typeof specRec.onchange === 'string' && specRec.onchange) {
    onchangeAttr = ` onchange="${escAttr(minifyJs(specRec.onchange))}"`;
  } else if (spec.readonly || readonly) {
    onchangeAttr =
      " readonly onFocus='this.initialSelect = this.selectedIndex;'" +
      " onChange='this.selectedIndex = this.initialSelect;'";
  }

  const selectHtml =
    `<select class="valid-target form-control${escAttr(elementClass)}"${styleAttr}` +
    ` name="${escAttr(bracketName)}" data-class="${escAttr(containerClass)}"` +
    ` data-keyword-min-length="${escAttr(keywordMinLength)}" data-delay="${escAttr(delay)}"` +
    ` data-api-server="${escAttr(apiServer)}" data-name="${escAttr(leafName(path))}"` +
    ` data-rule-name="${escAttr(ruleNameForPath(path))}" id="${escAttr(id)}"${onchangeAttr}` +
    ` data-default="${escAttr(phpString(spec.default))}">${optionHtml}</select>`;

  const callback =
    typeof specRec.callback === 'string' && specRec.callback
      ? `$('#${id}').on('select2:select', ${specRec.callback});`
      : '';

  return (
    <>
      {hideSearching && (
        <style
          nonce=""
          dangerouslySetInnerHTML={{
            __html: `.${id}_select2 .loading-results { display: none; }`,
          }}
        />
      )}
      <script
        nonce=""
        dangerouslySetInnerHTML={{
          __html: `$(function() {select2('${id}', '${keywordMinLength}', '${delay}', '${containerClass}');${callback}});`,
        }}
      />
      <div
        className="input-group field-search"
        dangerouslySetInnerHTML={{ __html: prependHtml + selectHtml + appendHtml }}
      />
    </>
  );
}

export default SearchField;
