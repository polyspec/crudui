/**
 * FormGroup Component
 *
 * Handles nested groups and multiple/sortable group rows.
 *
 * The reference fixtures (tests/fixtures/reference-html, captured from the legacy
 * Legacy PHP Generator) are the single source of truth for the markup:
 *
 *   single group   <div class="form-element-wrapper" name="<dot>-layer">
 *                    <h6>label</h6>[<p class="description">]
 *                    <div class="form-element">
 *                      <div data-uniqid class="input-group-wrapper">
 *                        <div class="form-group">…fields…</div>
 *
 *   multiple group  same wrapper, but .form-element contains one
 *                   .input-group-wrapper PER ROW; the row's data-uniqid IS the
 *                   row key used inside field names
 *                   (form[contacts][__k13__][name]); each row ends with
 *                   <span class="btn-group input-group-btn"> move/plus/minus
 *                   buttons (only when multiple === true — multiple: 'only'
 *                   renders rows without buttons).
 *
 * FormContext data is the single source of truth for row values; row keys are
 * derived via useMultipleRows. Do NOT write render-time value snapshots back
 * into the context (legacy edit-loss bug).
 */

import React, { useCallback, useRef } from 'react';
import { useFormContext } from '../context/FormContext';
import { useI18n } from '../context/I18nContext';
import { useMultipleRows } from '../hooks/useMultiple';
import { evaluateAllOfInternal } from '../hooks/useConditional';
import {
  resolveDisplayTargetParts,
  legacyWrapperClassName,
  legacyWrapperStyle,
} from '../hooks/legacyDisplay';
import { FormField } from './FormField';
import { ErrorMessage } from './common/ErrorMessage';
import { generateUniqid } from '../utils/dataAttributes';
import { parseStyleString, wrapperLayerName } from './fields/legacyParity';
import type { FormValue, FieldSpec, AllOfCondition } from '../types';

/**
 * PHP-truthiness used by the legacy group_class exist/empty switch.
 */
function hasData(value: FormValue): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return String(value).length > 0;
}

/**
 * Legacy multiple detection (Group::determineIsArray):
 * multiple true / 'true' / 'only' all render array rows.
 */
export function isMultipleSpec(spec: FieldSpec): boolean {
  const m = (spec as { multiple?: boolean | string }).multiple;
  return m === true || m === 'true' || m === 'only';
}

/**
 * Legacy field description: <p class="description"> with nl2br applied and
 * `*line` emphasized (Group::write). The text is spec-authored HTML — it is
 * injected raw, exactly like the PHP string interpolation.
 */
export function legacyDescriptionHtml(text: string): string {
  const bolded = text.replace(/\*(.*)\n/g, '<span class="bold">*$1</span>\n');
  return bolded.replace(/(\r\n|\n\r|\r|\n)/g, '<br />$1');
}

export function LegacyDescription({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p
      className="description"
      dangerouslySetInnerHTML={{ __html: legacyDescriptionHtml(text) }}
    />
  );
}

/**
 * Inner form-group class string (Group::write $groupClass):
 * "form-group" + group_class, where group_class supports
 * {exist, empty} objects and the "exist ! empty" string form.
 */
export function formGroupClassName(spec: FieldSpec, dataPresent: boolean): string {
  const classes = ['form-group'];
  const gc = (spec as Record<string, unknown>).group_class;
  if (gc && typeof gc === 'object' && !Array.isArray(gc)) {
    const obj = gc as { exist?: string; empty?: string };
    if (obj.exist !== undefined && obj.empty !== undefined) {
      classes.push((dataPresent ? obj.exist : obj.empty).trim());
    }
  } else if (typeof gc === 'string') {
    if (gc.includes('!')) {
      const [exist = '', empty = ''] = gc.split('!').map((s) => s.trim());
      classes.push(dataPresent ? exist : empty);
    } else {
      classes.push(gc.trim());
    }
  }
  return classes.filter(Boolean).join(' ');
}

/**
 * Group wrapper (form-element-wrapper) class/style — same legacy chain as
 * leaf fields (Group::write applies it to every property type):
 * class: base + spec.class + all_of class + display_target condition class;
 * style: spec.style + all_of inline + display_target condition style +
 * display:none when invisible. Legacy keeps hidden groups in the DOM
 * (reference: LargeForm option/option_* groups), never removes them.
 */
function groupWrapperPresentation(
  spec: FieldSpec,
  parentPath: string | undefined,
  data: FormValue | Record<string, FormValue>,
  rootSpec: unknown,
  visible: boolean
): { className: string; style: React.CSSProperties } {
  const allOfResult = spec.element?.all_of
    ? evaluateAllOfInternal(
        spec.element.all_of as AllOfCondition,
        data as Record<string, FormValue>
      )
    : null;
  const conditionParts = resolveDisplayTargetParts(
    spec as Record<string, unknown>,
    parentPath ?? '',
    data,
    rootSpec as Record<string, unknown>
  );
  return {
    className: legacyWrapperClassName(
      spec as Record<string, unknown>,
      allOfResult?.className,
      conditionParts
    ),
    style:
      legacyWrapperStyle(
        spec as Record<string, unknown>,
        allOfResult?.style,
        conditionParts,
        !visible
      ) ?? {},
  };
}

/**
 * Row/input wrapper class (Fields::addElement): input-group-wrapper
 * [clone-element when not the first row] [wrapper_class].
 */
export function inputGroupWrapperClassName(spec: FieldSpec, rowIndex = 0): string {
  const classes = ['input-group-wrapper'];
  if (rowIndex > 0) classes.push('clone-element');
  const wc = (spec as Record<string, unknown>).wrapper_class;
  if (typeof wc === 'string' && wc) classes.push(wc);
  return classes.join(' ');
}

/** PHP addcslashes($str, '"') — quote escaping for inline-attr JS. */
function addCSlashesQuote(s: string): string {
  return s.split('"').join('\\"');
}

/**
 * True when the spec carries the legacy dynamic_onchange inline JS
 * (Fields::addElement puts it on every row button as an onclick attribute).
 */
export function hasDynamicOnchange(spec: FieldSpec): boolean {
  const d = (spec as Record<string, unknown>).dynamic_onchange;
  return typeof d === 'string' && d !== '';
}

/**
 * Raw legacy row-buttons HTML — verbatim port of Fields::addElement
 * $btnGroupHtml (multiple === true). React cannot render string on*
 * attributes, so rows whose buttons need the dynamic_onchange onclick MUST
 * render this string (reference: LargeForm option groups/items). The &nbsp;
 * labels and the onclick value (PHP addcslashes($js, '"'), unminified, with
 * the YAML trailing newline) are part of the reference contract.
 */
export function legacyRowButtonsHtml(spec: FieldSpec): string {
  const dynRaw = (spec as Record<string, unknown>).dynamic_onchange;
  const dyn =
    typeof dynRaw === 'string' && dynRaw !== ''
      ? ` onclick="${addCSlashesQuote(dynRaw)}"`
      : '';
  const sortable = (spec as { sortable?: boolean }).sortable === true;
  const mm = (spec as Record<string, unknown>).multiple_max;
  const max = mm !== undefined && mm !== null ? `data-multiple-max="${String(mm)}"` : '';

  let html = '';
  if (sortable) {
    html += `<button  type="button" class="btn btn-move-up"${dyn}>&nbsp;</button>`;
    html += `<button  type="button" class="btn btn-move-down"${dyn}>&nbsp;</button>`;
  }
  html += `<button class="btn btn-plus" ${max} type="button"${dyn}>&nbsp;</button>`;
  let minusBtn = 'btn-minus';
  if ((spec as Record<string, unknown>).multiple_copy) {
    html += `<button class="btn btn-copy" type="button"${dyn}>&nbsp;</button>`;
    minusBtn = 'btn-minus btn-delete';
  }
  html += `<button class="btn ${minusBtn}" type="button"${dyn}>&nbsp;</button>`;
  return html;
}

/**
 * Delegated click handler for raw legacyRowButtonsHtml rows — keeps
 * add/remove/move interactive even though the buttons themselves are raw
 * HTML (clicks bubble to the React-owned container).
 */
export function rowButtonsClickHandler(handlers: {
  onAdd: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}): React.MouseEventHandler<HTMLElement> {
  return (e) => {
    const btn = (e.target as Element).closest?.('button');
    if (!btn) return;
    const cl = btn.classList;
    if (cl.contains('btn-plus') || cl.contains('btn-copy')) handlers.onAdd();
    else if (cl.contains('btn-minus')) handlers.onRemove();
    else if (cl.contains('btn-move-up')) handlers.onMoveUp();
    else if (cl.contains('btn-move-down')) handlers.onMoveDown();
  };
}

/**
 * Legacy row buttons (Fields::addElement, multiple === true only):
 * [move-up, move-down when sortable] plus[, data-multiple-max] minus.
 * Labels are literal &nbsp; — content, not whitespace.
 */
export function MultipleRowButtons({
  spec,
  onAdd,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  spec: FieldSpec;
  onAdd: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const sortable = (spec as { sortable?: boolean }).sortable === true;
  const multipleMax = (spec as Record<string, unknown>).multiple_max;
  const maxAttr =
    multipleMax !== undefined && multipleMax !== null
      ? { 'data-multiple-max': String(multipleMax) }
      : {};
  return (
    <>
      {sortable && (
        <>
          <button type="button" className="btn btn-move-up" onClick={onMoveUp}>
            {'\u00a0'}
          </button>
          <button type="button" className="btn btn-move-down" onClick={onMoveDown}>
            {'\u00a0'}
          </button>
        </>
      )}
      <button type="button" className="btn btn-plus" {...maxAttr} onClick={onAdd}>
        {'\u00a0'}
      </button>
      <button type="button" className="btn btn-minus" onClick={onRemove}>
        {'\u00a0'}
      </button>
    </>
  );
}

/**
 * FormGroup props
 */
interface FormGroupProps {
  /** Group name */
  name: string;
  /** Group specification */
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
 * FormGroup component
 */
export function FormGroup({
  name,
  spec,
  path,
  parentPath,
}: FormGroupProps) {
  const { spec: rootSpec, data, getValue, errors, keyPrefix, isFieldVisible } = useFormContext();
  const { t } = useI18n();

  // Generate stable uniqid for this group (like PHP's data-uniqid)
  const uniqidRef = useRef<string>(generateUniqid());

  // Get group label
  const label = spec.label ? t(spec.label) : undefined;

  // Get error for group level
  const error = errors[path];

  // Multiple groups render one row per data key
  if (isMultipleSpec(spec)) {
    return (
      <MultipleFormGroup
        name={name}
        spec={spec}
        path={path}
        parentPath={parentPath}
        label={label}
        error={error}
      />
    );
  }

  // Single group - matches Legacy original output exactly
  const wrapper = groupWrapperPresentation(
    spec,
    parentPath,
    data,
    rootSpec,
    isFieldVisible(path)
  );

  // Build wrapper name attribute (like PHP: "product.basic-layer")
  const wrapperName = wrapperLayerName(path, keyPrefix || undefined);

  const groupValue = getValue(path);
  const labelClass = (spec as { label_class?: string }).label_class ?? '';
  const groupStyle = parseStyleString((spec as Record<string, unknown>).group_style);

  return (
    <div className={wrapper.className} style={wrapper.style} {...{ name: wrapperName }}>
      {/* Group label - use h6 to match Legacy original */}
      {label && <h6 className={labelClass}>{label}</h6>}

      {/* Group description (legacy <p class="description">, nl2br) */}
      {spec.description && <LegacyDescription text={t(spec.description)} />}

      {/* form-element > input-group-wrapper > form-group structure like Legacy */}
      <div className="form-element">
        <div
          data-uniqid={uniqidRef.current}
          className={inputGroupWrapperClassName(spec)}
          style={parseStyleString((spec as Record<string, unknown>).wrapper_style) ?? {}}
        >
          <div
            className={formGroupClassName(spec, hasData(groupValue))}
            style={groupStyle}
          >{spec.properties && Object.entries(spec.properties).map(([fieldName, fieldSpec]) => (
            <FormField
              key={fieldName}
              name={fieldName}
              spec={fieldSpec}
              // Legacy keeps the literal [] suffix in the element name
              // (extractProperties: non-multiple "day[]" -> common[yoil][day][]
              // -> dot name common.yoil.day.*). FormField strips it for
              // multiple specs and derives the data path itself.
              path={`${path}.${fieldName}`}
              parentPath={path}
            />
          ))}</div>
        </div>
      </div>

      {/* Group error */}
      {error && <ErrorMessage message={error} />}
    </div>
  );
}

/**
 * Multiple FormGroup component
 */
interface MultipleFormGroupProps {
  name: string;
  spec: FieldSpec;
  path: string;
  parentPath?: string;
  label?: string;
  error?: string;
}

function MultipleFormGroup({
  spec,
  path,
  parentPath,
  label,
  error,
}: MultipleFormGroupProps) {
  const {
    spec: rootSpec,
    data,
    disabled: globalDisabled,
    readonly: globalReadonly,
    keyPrefix,
    isFieldVisible,
  } = useFormContext();
  const { t } = useI18n();

  // Row keys are DERIVED from FormContext data (single source of truth).
  const { rowKeys, getRowValue, add, remove, moveUp, moveDown } = useMultipleRows({
    path,
    min: spec.min as number | undefined,
    max: spec.max as number | undefined,
    defaultValue: useCallback((): FormValue => {
      // New rows start from property defaults (PHP starts from null; defaults
      // surface through each field's default fallback either way).
      const defaults: Record<string, FormValue> = {};
      if (spec.properties) {
        for (const [fieldName, fieldSpec] of Object.entries(spec.properties)) {
          if (fieldSpec.default !== undefined) {
            defaults[fieldName] = fieldSpec.default as FormValue;
          }
        }
      }
      return Object.keys(defaults).length > 0 ? defaults : null;
    }, [spec.properties]),
  });

  const isDisabled = globalDisabled || spec.disabled === true;
  const isReadonly = globalReadonly || spec.readonly === true;

  // Legacy renders the +/- button group only for multiple === true
  // (multiple: 'only' rows have no buttons), and never in disabled/readonly
  // interactive forms.
  const showButtons =
    (spec as { multiple?: boolean | string }).multiple === true &&
    !isDisabled &&
    !isReadonly;

  // Wrapper class/style — same legacy conditional chain as single groups
  const wrapper = groupWrapperPresentation(
    spec,
    parentPath,
    data,
    rootSpec,
    isFieldVisible(path)
  );

  // Build wrapper name attribute (like PHP: "product.items-layer")
  const wrapperName = wrapperLayerName(path, keyPrefix || undefined);

  const labelClass = (spec as { label_class?: string }).label_class ?? '';
  const groupStyle = parseStyleString((spec as Record<string, unknown>).group_style);

  return (
    <div className={wrapper.className} style={wrapper.style} {...{ name: wrapperName }}>
      {/* Group label */}
      {label && <h6 className={labelClass}>{label}</h6>}

      {/* Group description (legacy <p class="description">, nl2br) */}
      {spec.description && <LegacyDescription text={t(spec.description)} />}

      {/* form-element contains one input-group-wrapper PER ROW; the row's
          data-uniqid equals the row key used inside field names. */}
      <div className="form-element">
        {rowKeys.map((rowKey, rowIndex) => (
          <div
            key={rowKey}
            data-uniqid={rowKey}
            className={inputGroupWrapperClassName(spec, rowIndex)}
            style={parseStyleString((spec as Record<string, unknown>).wrapper_style) ?? {}}
          >
            <div
              className={formGroupClassName(spec, hasData(getRowValue(rowKey)))}
              style={groupStyle}
            >{spec.properties &&
              Object.entries(spec.properties).map(([fieldName, fieldSpec]) => (
                <FormField
                  key={fieldName}
                  name={fieldName}
                  spec={fieldSpec}
                  path={`${path}.${rowKey}.${fieldName.split('[]').join('')}`}
                  parentPath={`${path}.${rowKey}`}
                  index={rowIndex}
                  uniqueKey={rowKey}
                />
              ))}</div>
            {showButtons &&
              (hasDynamicOnchange(spec) ? (
                // dynamic_onchange rows carry an onclick ATTRIBUTE on every
                // button (legacy addElement) — React rejects string on*
                // props, so the buttons render raw; interactivity is kept by
                // click delegation on the span.
                <span
                  className="btn-group input-group-btn"
                  onClick={rowButtonsClickHandler({
                    onAdd: () => add(rowKey),
                    onRemove: () => remove(rowKey),
                    onMoveUp: () => moveUp(rowKey),
                    onMoveDown: () => moveDown(rowKey),
                  })}
                  dangerouslySetInnerHTML={{ __html: legacyRowButtonsHtml(spec) }}
                />
              ) : (
                <span className="btn-group input-group-btn">
                  <MultipleRowButtons
                    spec={spec}
                    onAdd={() => add(rowKey)}
                    onRemove={() => remove(rowKey)}
                    onMoveUp={() => moveUp(rowKey)}
                    onMoveDown={() => moveDown(rowKey)}
                  />
                </span>
              ))}
          </div>
        ))}
      </div>

      {/* Group error */}
      {error && <ErrorMessage message={error} />}
    </div>
  );
}

export default FormGroup;
