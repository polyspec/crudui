/**
 * FormField Component
 *
 * Field dispatcher that renders appropriate field component based on type.
 *
 * Golden markup contract (legacy Legacy Group::write, single source of
 * truth = tests/fixtures/golden-html):
 *
 *   <div class="form-element-wrapper[ spec.class][ allOf class]"
 *        style="[spec.style][allOf style]" name="<dot-path>-layer">
 *     <h6 class="[label_class]">label</h6>
 *     [<p class="description">nl2br(description)</p>]
 *     <div class="form-element">
 *       <div data-uniqid="__13hex__" class="input-group-wrapper[ wrapper_class]">
 *         …field markup…
 *
 * Property keys may carry a literal "[]" suffix (additionals[], items[]):
 * the suffix is stripped from the data path. Combined with
 * multiple true/'true'/'only' the field renders one row per data key —
 * see MultipleLeafField below and FormGroup for group rows.
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFormContext } from '../context/FormContext';
import { useI18n } from '../context/I18nContext';
import { useConditional } from '../hooks/useConditional';
import {
  resolveDisplayTargetParts,
  legacyWrapperClassName,
  legacyWrapperStyle,
  type DisplayTargetParts,
} from '../hooks/legacyDisplay';
import { useMultipleRows } from '../hooks/useMultiple';
import {
  FormGroup,
  isMultipleSpec,
  LegacyDescription,
  MultipleRowButtons,
  inputGroupWrapperClassName,
  legacyRowButtonsHtml,
  rowButtonsClickHandler,
} from './FormGroup';
import { ErrorMessage } from './common/ErrorMessage';
import { getFieldComponent } from './fields';
import { parseStyleString, wrapperLayerName } from './fields/legacyParity';
import { datetimeLegacyRawHtml, datetimeNeedsRawHtml } from './fields/DatetimeField';
import { generateUniqid } from '../utils/dataAttributes';
import type { FormValue, Language, FieldComponentProps, AllOfCondition, AllOfResult, FieldSpec } from '../types';

/**
 * FormField props
 */
interface FormFieldProps {
  /** Field name */
  name: string;
  /** Field specification */
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
 * Strip the legacy "[]" key suffix from the data path of an array-rendered
 * field (PHP: str_replace('[]', '', $propertyKey) when isArray).
 */
function stripArraySuffix(path: string, spec: FieldSpec): string {
  if (isMultipleSpec(spec) && path.includes('[]')) {
    return path.split('[]').join('');
  }
  return path;
}

/**
 * FormField component
 */
export function FormField({
  name,
  spec,
  path: rawPath,
  parentPath,
  index,
  uniqueKey,
}: FormFieldProps) {
  const path = stripArraySuffix(rawPath, spec);
  const {
    spec: rootSpec,
    data,
    getValue,
    setValue,
    errors,
    validateField,
    isFieldVisible,
    registerField,
    unregisterField,
    disabled: globalDisabled,
    readonly: globalReadonly,
    customFields,
    keyPrefix,
  } = useFormContext();
  const { language, t } = useI18n();
  const { evaluateAllOf } = useConditional({ path });

  // Generate stable uniqid for this field (like PHP's data-uniqid)
  const uniqidRef = useRef<string>(generateUniqid());

  // Register/unregister field
  useEffect(() => {
    registerField(path);
    return () => unregisterField(path);
  }, [path, registerField, unregisterField]);

  // Check visibility — legacy never removes a hidden field from the DOM;
  // invisibility renders as wrapper style display:none (golden contract).
  const visible = useMemo(() => isFieldVisible(path), [isFieldVisible, path]);

  // Evaluate element.all_of for styling
  const allOfResult = useMemo((): AllOfResult | null => {
    if (spec.element?.all_of) {
      return evaluateAllOf(spec.element.all_of as AllOfCondition);
    }
    return null;
  }, [spec.element, evaluateAllOf]);

  // Legacy display_target condition maps (Group::processSingleTarget) —
  // wrapper class/style additions resolved against the PARENT dot path.
  const conditionParts = useMemo(
    (): DisplayTargetParts =>
      resolveDisplayTargetParts(
        spec as Record<string, unknown>,
        parentPath ?? '',
        data,
        rootSpec as unknown as Record<string, unknown>
      ),
    [spec, parentPath, data, rootSpec]
  );

  // Get current value
  const value = getValue(path);

  // Get error message
  const error = errors[path];

  // Determine disabled/readonly state
  const isDisabled = globalDisabled || spec.disabled === true;
  const isReadonly = globalReadonly || spec.readonly === true;

  // Handle value change
  const handleChange = useCallback(
    (newValue: FormValue) => {
      setValue(path, newValue);
    },
    [path, setValue]
  );

  // Handle blur (validate)
  const handleBlur = useCallback(() => {
    validateField(path);
  }, [path, validateField]);

  // Handle group type — ALWAYS routed to FormGroup. A group without
  // properties renders an empty <div class="form-group"></div> (legacy
  // behavior, e.g. LargeForm common.product_type_attribute_items).
  if (spec.type === 'group') {
    return (
      <FormGroup
        name={name}
        spec={spec}
        path={path}
        parentPath={parentPath}
        index={index}
        uniqueKey={uniqueKey}
      />
    );
  }

  // Multiple leaf field (select/text/... with multiple) — one row per key
  if (isMultipleSpec(spec)) {
    return (
      <MultipleLeafField
        name={name}
        spec={spec}
        path={path}
        parentPath={parentPath}
      />
    );
  }

  // Get field component
  const FieldComponent = customFields[spec.type] ?? getFieldComponent(spec.type);

  if (!FieldComponent) {
    console.warn(`Unknown field type: ${spec.type}`);
    return null;
  }

  // Prepare field props
  const fieldProps: FieldComponentProps = {
    name,
    spec,
    value,
    onChange: handleChange,
    onBlur: handleBlur,
    error,
    disabled: isDisabled,
    readonly: isReadonly,
    language: language as Language,
    path,
    parentPath,
    index,
    uniqueKey,
  };

  // Get translated label
  const label = spec.label ? t(spec.label) : undefined;

  // Build wrapper name attribute (like PHP: "product.basic.name-layer";
  // literal "[]" key suffixes render as ".*" — Group::getDotName)
  const wrapperName = wrapperLayerName(path, keyPrefix || undefined);

  // Checkbox has completely different structure in PHP Legacy
  if (spec.type === 'checkbox' || spec.type === 'switcher') {
    return (
      <div
        className={fieldWrapperClassName(spec, allOfResult, conditionParts)}
        style={fieldWrapperStyle(spec, allOfResult, conditionParts, !visible)}
        {...{ name: wrapperName }}
      >
        <div className="checkbox">
          <h6>
            <div data-uniqid={uniqidRef.current} className={inputGroupWrapperClassName(spec)} style={{}}>
              <FieldComponent {...fieldProps} />
            </div>
          </h6>
          {/* Legacy checkbox keeps the description INSIDE .checkbox */}
          {spec.description && <LegacyDescription text={t(spec.description)} />}
        </div>
        {/* Error message */}
        {error && <ErrorMessage message={error} />}
      </div>
    );
  }

  // Legacy-raw wrapper branch: specs whose BARE input carries inline-JS
  // attributes (datetime event onchange/data-onload) render the verbatim
  // PHP markup on the .input-group-wrapper — React rejects string on*
  // props and the golden input has no field-owned container of its own.
  const rawWrapperHtml =
    (spec.type === 'datetime' || spec.type === 'datetime-local') &&
    datetimeNeedsRawHtml(spec)
      ? datetimeLegacyRawHtml(spec, path, keyPrefix || undefined, value)
      : null;

  return (
    <div
      className={fieldWrapperClassName(spec, allOfResult, conditionParts)}
      style={fieldWrapperStyle(spec, allOfResult, conditionParts, !visible)}
      {...{ name: wrapperName }}
    >
      {/* Label - use h6 to match Legacy original */}
      {label && spec.type !== 'hidden' && (
        <h6 className={(spec as { label_class?: string }).label_class ?? ''}>{label}</h6>
      )}

      {/* Description (legacy <p class="description">, nl2br) */}
      {spec.description && <LegacyDescription text={t(spec.description)} />}

      {/* form-element > input-group-wrapper structure like Legacy */}
      <div className="form-element">
        {rawWrapperHtml !== null ? (
          <div
            data-uniqid={uniqidRef.current}
            className={inputGroupWrapperClassName(spec)}
            style={{}}
            dangerouslySetInnerHTML={{ __html: rawWrapperHtml }}
          />
        ) : (
          <div data-uniqid={uniqidRef.current} className={inputGroupWrapperClassName(spec)} style={{}}>
            {/* Field component */}
            <FieldComponent {...fieldProps} />
          </div>
        )}
      </div>

      {/* Error message */}
      {error && <ErrorMessage message={error} />}
    </div>
  );
}

/**
 * form-element-wrapper class chain (Group::write addClass order):
 * base, spec.class (NOT wrapper_class — that belongs to the inner
 * .input-group-wrapper), element.all_of class, display_target condition
 * classes.
 */
function fieldWrapperClassName(
  spec: FieldSpec,
  allOfResult: AllOfResult | null,
  conditionParts: DisplayTargetParts | null
): string {
  return legacyWrapperClassName(
    spec as Record<string, unknown>,
    allOfResult?.className,
    conditionParts
  );
}

/**
 * form-element-wrapper style chain (Group::write addStyle order):
 * spec.style, element.all_of inline, display_target condition style, then
 * display:none when the field is invisible — legacy keeps hidden fields in
 * the DOM (golden contract), never removes them.
 */
function fieldWrapperStyle(
  spec: FieldSpec,
  allOfResult: AllOfResult | null,
  conditionParts: DisplayTargetParts | null,
  hidden = false
): React.CSSProperties {
  return (
    legacyWrapperStyle(
      spec as Record<string, unknown>,
      allOfResult?.style,
      conditionParts,
      hidden
    ) ?? {}
  );
}

/**
 * Multiple leaf field — legacy Group::generateElements for non-group types:
 * one .input-group-wrapper per row whose data-uniqid IS the row key inside
 * the field name (additionals[__13hex__]); multiple === true rows receive
 * the move/plus/minus buttons at the field's `<!--btn-->` slot (last child
 * of .input-group); multiple: 'only' rows render without buttons.
 */
function MultipleLeafField({
  name,
  spec,
  path,
  parentPath,
}: {
  name: string;
  spec: FieldSpec;
  path: string;
  parentPath?: string;
}) {
  const {
    spec: rootSpec,
    data,
    getValue,
    setValue,
    errors,
    validateField,
    isFieldVisible,
    disabled: globalDisabled,
    readonly: globalReadonly,
    customFields,
    keyPrefix,
  } = useFormContext();
  const { language, t } = useI18n();

  const visible = isFieldVisible(path);
  const conditionParts = useMemo(
    (): DisplayTargetParts =>
      resolveDisplayTargetParts(
        spec as Record<string, unknown>,
        parentPath ?? '',
        data,
        rootSpec as unknown as Record<string, unknown>
      ),
    [spec, parentPath, data, rootSpec]
  );

  const { rowKeys, add, remove, moveUp, moveDown } = useMultipleRows({
    path,
    min: spec.min as number | undefined,
    max: spec.max as number | undefined,
    defaultValue: useCallback(
      (): FormValue => (spec.default !== undefined ? (spec.default as FormValue) : null),
      [spec.default]
    ),
  });

  const FieldComponent = customFields[spec.type] ?? getFieldComponent(spec.type);
  if (!FieldComponent) {
    console.warn(`Unknown field type: ${spec.type}`);
    return null;
  }

  const isDisabled = globalDisabled || spec.disabled === true;
  const isReadonly = globalReadonly || spec.readonly === true;
  const showButtons =
    (spec as { multiple?: boolean | string }).multiple === true &&
    !isDisabled &&
    !isReadonly;

  const label = spec.label ? t(spec.label) : undefined;
  const wrapperName = wrapperLayerName(path, keyPrefix || undefined);

  return (
    <div
      className={fieldWrapperClassName(spec, null, conditionParts)}
      style={fieldWrapperStyle(spec, null, conditionParts, !visible)}
      {...{ name: wrapperName }}
    >
      {label && spec.type !== 'hidden' && (
        <h6 className={(spec as { label_class?: string }).label_class ?? ''}>{label}</h6>
      )}

      {spec.description && <LegacyDescription text={t(spec.description)} />}

      <div className="form-element">
        {rowKeys.map((rowKey, rowIndex) => {
          const rowPath = `${path}.${rowKey}`;
          const fieldProps: FieldComponentProps = {
            name,
            spec,
            value: getValue(rowPath),
            onChange: (newValue: FormValue) => setValue(rowPath, newValue),
            onBlur: () => validateField(rowPath),
            error: errors[rowPath],
            disabled: isDisabled,
            readonly: isReadonly,
            language: language as Language,
            path: rowPath,
            parentPath,
            index: rowIndex,
            uniqueKey: rowKey,
            buttons: showButtons ? (
              <MultipleRowButtons
                spec={spec}
                onAdd={() => add(rowKey)}
                onRemove={() => remove(rowKey)}
                onMoveUp={() => moveUp(rowKey)}
                onMoveDown={() => moveDown(rowKey)}
              />
            ) : undefined,
            // Raw alternative for the same slot — consumed by the field's
            // legacy-raw branch (inline onchange/dynamic_onchange specs).
            buttonsHtml: showButtons ? legacyRowButtonsHtml(spec) : undefined,
            onButtonsClick: showButtons
              ? rowButtonsClickHandler({
                  onAdd: () => add(rowKey),
                  onRemove: () => remove(rowKey),
                  onMoveUp: () => moveUp(rowKey),
                  onMoveDown: () => moveDown(rowKey),
                })
              : undefined,
          };
          return (
            <div
              key={rowKey}
              data-uniqid={rowKey}
              className={inputGroupWrapperClassName(spec, rowIndex)}
              style={parseStyleString((spec as Record<string, unknown>).wrapper_style) ?? {}}
            >
              <FieldComponent {...fieldProps} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default FormField;
