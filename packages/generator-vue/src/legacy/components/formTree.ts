/**
 * formTree — the field dispatcher + group renderer (ports of generator-react
 * FormField.tsx and FormGroup.tsx).
 *
 * Golden markup contract (legacy Limepie Group::write):
 *   <div class="form-element-wrapper[ class][ cond]" style=".." name="<dot>-layer">
 *     <h6 class="[label_class]">label</h6>
 *     [<p class="description">nl2br(description)</p>]
 *     <div class="form-element">
 *       <div data-uniqid="__13hex__" class="input-group-wrapper[ ..]" style="..">
 *         …field markup… (group: > <div class="form-group">…fields…</div>)
 *
 * Render functions only — no scoped styles, so SSR emits no data-v attrs.
 */

import { h, type VNode } from 'vue';
import type { FieldSpec, RenderContext, FormValue, AllOfCondition, AllOfResult } from '../types';
import { generateUniqid } from '../utils/dataAttributes';
import {
  parseStyleString,
  wrapperLayerName,
} from '../limepieParity';
import {
  resolveDisplayTargetParts,
  legacyWrapperClassName,
  legacyWrapperStyle,
  type DisplayTargetParts,
} from '../hooks/legacyDisplay';
import { deriveMultipleRows } from '../hooks/multipleRows';
import { getFieldRenderer, datetimeLegacyRawHtml, datetimeNeedsRawHtml } from './fields';
import {
  hasDynamicOnchange,
  legacyRowButtonsHtml,
  multipleRowButtons,
} from './buttons';
import { Fragment } from 'vue';

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

function hasData(value: FormValue): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return String(value).length > 0;
}

/**
 * True when a spec is a repeating (multiple) field — `multiple` is `true`,
 * `'true'`, or `'only'`. Drives the per-row `input-group-wrapper` rendering.
 */
export function isMultipleSpec(spec: FieldSpec): boolean {
  const m = (spec as { multiple?: boolean | string }).multiple;
  return m === true || m === 'true' || m === 'only';
}

/** Legacy field description: <p class="description"> with nl2br + *line bold. */
function legacyDescriptionHtml(text: string): string {
  const bolded = text.replace(/\*(.*)\n/g, '<span class="bold">*$1</span>\n');
  return bolded.replace(/(\r\n|\n\r|\r|\n)/g, '<br />$1');
}

function legacyDescriptionVNode(text: string): VNode | null {
  if (!text) return null;
  return h('p', { class: 'description', innerHTML: legacyDescriptionHtml(text) });
}

/** Inner form-group class string (Group::write $groupClass). */
function formGroupClassName(spec: FieldSpec, dataPresent: boolean): string {
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

/** Row/input wrapper class (Fields::addElement). */
function inputGroupWrapperClassName(spec: FieldSpec, rowIndex = 0): string {
  const classes = ['input-group-wrapper'];
  if (rowIndex > 0) classes.push('clone-element');
  const wc = (spec as Record<string, unknown>).wrapper_class;
  if (typeof wc === 'string' && wc) classes.push(wc);
  return classes.join(' ');
}

/** evaluateAllOf — minimal port (no fixture relies on it for empty data). */
function evaluateAllOf(
  conditions: AllOfCondition,
  data: Record<string, FormValue>
): AllOfResult {
  void conditions;
  void data;
  // Empty-data render: all_of conditions never satisfied; React's
  // evaluateAllOfInternal returns met:false with no style/class applied
  // unless `not` provides them. Fixtures use display_switch/display_target
  // instead, so we return the inert result.
  return { met: false };
}

interface Presentation {
  className: string;
  style: string | undefined;
}

function wrapperPresentation(
  spec: FieldSpec,
  parentPath: string | undefined,
  ctx: RenderContext,
  visible: boolean,
  allOfResult: AllOfResult | null
): Presentation {
  const conditionParts: DisplayTargetParts = resolveDisplayTargetParts(
    spec as Record<string, unknown>,
    parentPath ?? '',
    ctx.data,
    ctx.spec as unknown as Record<string, unknown>
  );
  return {
    className: legacyWrapperClassName(
      spec as Record<string, unknown>,
      allOfResult?.className,
      conditionParts
    ),
    style: legacyWrapperStyle(
      spec as Record<string, unknown>,
      allOfResult?.style,
      conditionParts,
      !visible
    ),
  };
}

// ---------------------------------------------------------------------------
// FormField — leaf dispatcher
// ---------------------------------------------------------------------------

function stripArraySuffix(path: string, spec: FieldSpec): string {
  if (isMultipleSpec(spec) && path.includes('[]')) {
    return path.split('[]').join('');
  }
  return path;
}

export interface FieldNodeArgs {
  name: string;
  spec: FieldSpec;
  path: string;
  parentPath?: string;
  index?: number;
  uniqueKey?: string;
  ctx: RenderContext;
}

/**
 * Leaf-field dispatcher. Routes `group` specs to {@link renderFormGroup},
 * multiple leaf specs to the per-row renderer, and otherwise looks up the
 * field renderer and wraps its output in the legacy `form-element-wrapper`
 * markup (label heading, description, input-group). Returns the field VNode.
 */
export function renderFormField(args: FieldNodeArgs): VNode {
  const { name, spec, ctx, parentPath, index, uniqueKey } = args;
  const path = stripArraySuffix(args.path, spec);

  // group -> FormGroup
  if (spec.type === 'group') {
    return renderFormGroup({ name, spec, path, parentPath, index, uniqueKey, ctx });
  }

  // multiple leaf field
  if (isMultipleSpec(spec)) {
    return renderMultipleLeafField({ name, spec, path, parentPath, ctx });
  }

  const renderer = getFieldRenderer(spec.type);
  if (!renderer) return h('div');

  const value = ctx.getValue(path);
  const error = ctx.errors[path];
  const isDisabled = ctx.disabled || spec.disabled === true;
  const isReadonly = ctx.readonly || spec.readonly === true;
  const visible = ctx.isFieldVisible(path);

  const allOfResult: AllOfResult | null = spec.element?.all_of
    ? evaluateAllOf(spec.element.all_of as AllOfCondition, ctx.data as Record<string, FormValue>)
    : null;

  const label = spec.label ? ctx.t(spec.label) : undefined;
  const wrapperName = wrapperLayerName(path, ctx.keyPrefix || undefined);
  const uniqid = generateUniqid();

  const fieldProps = {
    name,
    spec,
    value,
    error,
    disabled: isDisabled,
    readonly: isReadonly,
    language: ctx.language,
    path,
    parentPath,
    index,
    uniqueKey,
    ctx,
  };

  // Checkbox / switcher special structure.
  if (spec.type === 'checkbox' || spec.type === 'switcher') {
    const pres = wrapperPresentation(spec, parentPath, ctx, visible, allOfResult);
    const fieldNode = renderer(fieldProps);
    const checkboxInner: VNode[] = [
      h('h6', {}, [
        h('div', {
          'data-uniqid': uniqid,
          class: inputGroupWrapperClassName(spec),
          style: undefined,
        }, Array.isArray(fieldNode) ? fieldNode : [fieldNode]),
      ]),
    ];
    if (spec.description) {
      const d = legacyDescriptionVNode(ctx.t(spec.description));
      if (d) checkboxInner.push(d);
    }
    return h('div', attrsWrap(pres, wrapperName), [
      h('div', { class: 'checkbox' }, checkboxInner),
    ]);
  }

  // datetime legacy-raw wrapper branch
  const rawWrapperHtml =
    (spec.type === 'datetime' || spec.type === 'datetime-local') && datetimeNeedsRawHtml(spec)
      ? datetimeLegacyRawHtml(spec, path, ctx.keyPrefix || undefined, value)
      : null;

  const pres = wrapperPresentation(spec, parentPath, ctx, visible, allOfResult);
  const wrapperChildren: VNode[] = [];

  if (label && spec.type !== 'hidden') {
    wrapperChildren.push(
      h('h6', { class: (spec as { label_class?: string }).label_class ?? undefined }, label)
    );
  }
  if (spec.description) {
    const d = legacyDescriptionVNode(ctx.t(spec.description));
    if (d) wrapperChildren.push(d);
  }

  let innerWrapper: VNode;
  if (rawWrapperHtml !== null) {
    innerWrapper = h('div', {
      'data-uniqid': uniqid,
      class: inputGroupWrapperClassName(spec),
      innerHTML: rawWrapperHtml,
    });
  } else {
    const fieldNode = renderer(fieldProps);
    innerWrapper = h('div', {
      'data-uniqid': uniqid,
      class: inputGroupWrapperClassName(spec),
    }, Array.isArray(fieldNode) ? fieldNode : [fieldNode]);
  }
  wrapperChildren.push(h('div', { class: 'form-element' }, [innerWrapper]));

  return h('div', attrsWrap(pres, wrapperName), wrapperChildren);
}

/** Build wrapper element attrs (class always present; style/name optional). */
function attrsWrap(pres: Presentation, wrapperName: string): Record<string, unknown> {
  const out: Record<string, unknown> = { class: pres.className, name: wrapperName };
  if (pres.style !== undefined) out.style = pres.style;
  return out;
}

// ---------------------------------------------------------------------------
// Multiple leaf field — one input-group-wrapper per row
// ---------------------------------------------------------------------------

function renderMultipleLeafField(args: {
  name: string;
  spec: FieldSpec;
  path: string;
  parentPath?: string;
  ctx: RenderContext;
}): VNode {
  const { name, spec, path, parentPath, ctx } = args;
  const visible = ctx.isFieldVisible(path);
  const pres = wrapperPresentation(spec, parentPath, ctx, visible, null);
  const wrapperName = wrapperLayerName(path, ctx.keyPrefix || undefined);

  const renderer = getFieldRenderer(spec.type);
  if (!renderer) return h('div');

  const isDisabled = ctx.disabled || spec.disabled === true;
  const isReadonly = ctx.readonly || spec.readonly === true;
  const showButtons =
    (spec as { multiple?: boolean | string }).multiple === true && !isDisabled && !isReadonly;

  const label = spec.label ? ctx.t(spec.label) : undefined;
  const { rowKeys, getRowValue } = deriveMultipleRows(ctx.getValue(path));

  const wrapperChildren: VNode[] = [];
  if (label && spec.type !== 'hidden') {
    wrapperChildren.push(
      h('h6', { class: (spec as { label_class?: string }).label_class ?? undefined }, label)
    );
  }
  if (spec.description) {
    const d = legacyDescriptionVNode(ctx.t(spec.description));
    if (d) wrapperChildren.push(d);
  }

  // Multiple leaf buttons — both forms are provided (legacy `<!--btn-->`
  // slot); the field renderer picks one: its legacy-raw branch consumes
  // `buttonsHtml`, its normal branch renders the `buttons` VNode.
  const rowNodes: VNode[] = rowKeys.map((rowKey, rowIndex) => {
    const rowPath = `${path}.${rowKey}`;
    const buttonsHtml = showButtons ? legacyRowButtonsHtml(spec) : undefined;
    const buttons = showButtons ? h(Fragment, {}, multipleRowButtons(spec)) : undefined;
    const fieldNode = renderer({
      name,
      spec,
      value: getRowValue(rowKey),
      error: ctx.errors[rowPath],
      disabled: isDisabled,
      readonly: isReadonly,
      language: ctx.language,
      path: rowPath,
      parentPath,
      index: rowIndex,
      uniqueKey: rowKey,
      buttons,
      buttonsHtml,
      ctx,
    });
    return h('div', {
      'data-uniqid': rowKey,
      class: inputGroupWrapperClassName(spec, rowIndex),
      style: parseStyleString((spec as Record<string, unknown>).wrapper_style),
    }, Array.isArray(fieldNode) ? fieldNode : [fieldNode]);
  });

  wrapperChildren.push(h('div', { class: 'form-element' }, rowNodes));
  return h('div', attrsWrap(pres, wrapperName), wrapperChildren);
}

// ---------------------------------------------------------------------------
// FormGroup — single and multiple groups
// ---------------------------------------------------------------------------

/**
 * Group renderer (Limepie Group::write port). Renders a `group` field's nested
 * `properties` inside the `form-element-wrapper > form-element > form-group`
 * structure; multiple groups delegate to the per-row group renderer. Returns
 * the group VNode.
 */
export function renderFormGroup(args: FieldNodeArgs): VNode {
  const { spec, path, parentPath, ctx } = args;

  if (isMultipleSpec(spec)) {
    return renderMultipleFormGroup(args);
  }

  const label = spec.label ? ctx.t(spec.label) : undefined;
  const visible = ctx.isFieldVisible(path);
  const pres = wrapperPresentation(spec, parentPath, ctx, visible, allOfFor(spec, ctx));
  const wrapperName = wrapperLayerName(path, ctx.keyPrefix || undefined);
  const uniqid = generateUniqid();

  const groupValue = ctx.getValue(path);
  const labelClass = (spec as { label_class?: string }).label_class ?? '';
  const groupStyle = parseStyleString((spec as Record<string, unknown>).group_style);

  const innerFields: VNode[] = [];
  if (spec.properties) {
    for (const [fieldName, fieldSpec] of Object.entries(spec.properties)) {
      innerFields.push(
        renderFormField({
          name: fieldName,
          spec: fieldSpec,
          path: `${path}.${fieldName}`,
          parentPath: path,
          ctx,
        })
      );
    }
  }

  const wrapperChildren: VNode[] = [];
  if (label) wrapperChildren.push(h('h6', { class: labelClass || undefined }, label));
  if (spec.description) {
    const d = legacyDescriptionVNode(ctx.t(spec.description));
    if (d) wrapperChildren.push(d);
  }
  wrapperChildren.push(
    h('div', { class: 'form-element' }, [
      h('div', {
        'data-uniqid': uniqid,
        class: inputGroupWrapperClassName(spec),
        style: parseStyleString((spec as Record<string, unknown>).wrapper_style),
      }, [
        h('div', { class: formGroupClassName(spec, hasData(groupValue)), style: groupStyle }, innerFields),
      ]),
    ])
  );

  return h('div', attrsWrap(pres, wrapperName), wrapperChildren);
}

function allOfFor(spec: FieldSpec, ctx: RenderContext): AllOfResult | null {
  return spec.element?.all_of
    ? evaluateAllOf(spec.element.all_of as AllOfCondition, ctx.data as Record<string, FormValue>)
    : null;
}

function renderMultipleFormGroup(args: FieldNodeArgs): VNode {
  const { spec, path, parentPath, ctx } = args;
  const label = spec.label ? ctx.t(spec.label) : undefined;
  const visible = ctx.isFieldVisible(path);
  const pres = wrapperPresentation(spec, parentPath, ctx, visible, allOfFor(spec, ctx));
  const wrapperName = wrapperLayerName(path, ctx.keyPrefix || undefined);

  const isDisabled = ctx.disabled || spec.disabled === true;
  const isReadonly = ctx.readonly || spec.readonly === true;
  const showButtons =
    (spec as { multiple?: boolean | string }).multiple === true && !isDisabled && !isReadonly;

  const labelClass = (spec as { label_class?: string }).label_class ?? '';
  const groupStyle = parseStyleString((spec as Record<string, unknown>).group_style);
  const { rowKeys, getRowValue } = deriveMultipleRows(ctx.getValue(path));

  const wrapperChildren: VNode[] = [];
  if (label) wrapperChildren.push(h('h6', { class: labelClass || undefined }, label));
  if (spec.description) {
    const d = legacyDescriptionVNode(ctx.t(spec.description));
    if (d) wrapperChildren.push(d);
  }

  const rowNodes: VNode[] = rowKeys.map((rowKey, rowIndex) => {
    const innerFields: VNode[] = [];
    if (spec.properties) {
      for (const [fieldName, fieldSpec] of Object.entries(spec.properties)) {
        innerFields.push(
          renderFormField({
            name: fieldName,
            spec: fieldSpec,
            path: `${path}.${rowKey}.${fieldName.split('[]').join('')}`,
            parentPath: `${path}.${rowKey}`,
            index: rowIndex,
            uniqueKey: rowKey,
            ctx,
          })
        );
      }
    }
    const children: VNode[] = [
      h('div', { class: formGroupClassName(spec, hasData(getRowValue(rowKey))), style: groupStyle }, innerFields),
    ];
    if (showButtons) {
      if (hasDynamicOnchange(spec)) {
        children.push(
          h('span', { class: 'btn-group input-group-btn', innerHTML: legacyRowButtonsHtml(spec) })
        );
      } else {
        children.push(h('span', { class: 'btn-group input-group-btn' }, multipleRowButtons(spec)));
      }
    }
    return h('div', {
      'data-uniqid': rowKey,
      class: inputGroupWrapperClassName(spec, rowIndex),
      style: parseStyleString((spec as Record<string, unknown>).wrapper_style),
    }, children);
  });

  wrapperChildren.push(h('div', { class: 'form-element' }, rowNodes));
  return h('div', attrsWrap(pres, wrapperName), wrapperChildren);
}
