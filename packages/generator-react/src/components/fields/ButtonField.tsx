/**
 * ButtonField Component
 *
 * Verbatim port of the legacy Limepie Generator\Fields\Button::write()
 * (single source of truth = tests/fixtures/golden-html, e.g. ProductNft
 * option.button "조합"):
 *
 *   <script nonce="">
 *   $(function() {
 *       {init_script}
 *       $("#btn{id}").on('click', function() {
 *           {onclick}
 *       });
 *   });
 *   </script>
 *   <input type="hidden" class="valid-target form-control" readonly
 *          name="{key}" data-name=".." data-rule-name=".." value=".."
 *          data-default=".." />
 *   <input type="button" class="btn{button_class}" name="btn{key}"
 *          id="btn{id}" value="{text}" [readonly] />
 *
 * id = key with '[' -> '_' and ']' removed (option[button] -> option_button).
 * The init_script/onclick JS is embedded RAW (legacy does not minify here).
 * Inline jQuery is legacy surface — the script only executes in a jQuery
 * page, never inside React. No .input-group wrapper (legacy has none).
 */

import React from 'react';
import type { FieldComponentProps } from '../../types';
import { useFormContext } from '../../context/FormContext';
import { useI18n } from '../../context/I18nContext';
import { toBracketNotationWithPrefix } from '../../utils/dataAttributes';
import { applyDefaultString, limepieDataAttrs, phpString } from './limepieParity';
import type { MultiLangText } from '../../types';

/**
 * ButtonField component
 */
export function ButtonField({ spec, value, path, readonly }: FieldComponentProps) {
  const { keyPrefix } = useFormContext();
  const { t } = useI18n();

  const bracketName = toBracketNotationWithPrefix(path, keyPrefix || undefined);
  // PHP: $id = str_replace(['[', ']'], ['_', ''], $key)
  const id = bracketName.split('[').join('_').split(']').join('');

  const dataAttrs = limepieDataAttrs(spec, path);
  // PHP: rule_name property overrides the computed rule name
  const ruleName =
    typeof (spec as Record<string, unknown>).rule_name === 'string'
      ? ((spec as Record<string, unknown>).rule_name as string)
      : dataAttrs['data-rule-name']!;

  const initScript =
    typeof (spec as Record<string, unknown>).init_script === 'string'
      ? ((spec as Record<string, unknown>).init_script as string)
      : '';
  const onclick = typeof spec.onclick === 'string' ? spec.onclick : '';

  // Heredoc-equivalent script body — content is whitespace-insensitive for
  // parity (normalizer collapses runs), but keep the legacy shape readable.
  const script =
    `\n$(function() {\n    ${initScript}\n    $("#btn${id}").on('click', function() {\n        ${onclick}\n    });\n});\n`;

  const displayValue = applyDefaultString(value, spec.default);
  const text = spec.text !== undefined ? t(spec.text as string | MultiLangText) : '';
  const isReadonly = readonly || phpString(spec.readonly) === '1' || spec.readonly === true;

  return (
    <>
      <script nonce="" dangerouslySetInnerHTML={{ __html: script }} />
      <input
        type="hidden"
        className="valid-target form-control"
        readOnly
        name={bracketName}
        data-name={dataAttrs['data-name']}
        data-rule-name={ruleName}
        value={displayValue}
        data-default={dataAttrs['data-default']}
      />
      <input
        type="button"
        className={`btn${spec.button_class ? ` ${spec.button_class as string}` : ''}`}
        name={`btn${bracketName}`}
        id={`btn${id}`}
        defaultValue={text}
        readOnly={isReadonly || undefined}
      />
    </>
  );
}

export default ButtonField;
