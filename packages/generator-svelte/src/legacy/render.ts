/**
 * render — pure HTML renderer for the form CONTENT (the legacy Legacy
 * Generator::write() output: form-group + footer; the host owns the <form>).
 *
 * This reproduces the generator-react component tree (FormBuilder -> FormField
 * -> FormGroup -> field components) at SSR time with the EXACT same structure.
 * The Svelte components (FormBuilder.svelte) delegate to renderFormContent;
 * field inner markup comes from ./fieldHtml (the verified parity emitters),
 * exactly as the React fields used dangerouslySetInnerHTML / JSX.
 */

import {
  escAttr,
  escText,
  leafName,
  phpString,
  ruleNameForPath,
  styleString,
  wrapperLayerName,
  type SpecNode,
} from './components/fields/legacyParity';
import { generateUniqid, getValueByPath } from './utils';
import {
  resolveDisplayTargetParts,
  legacyWrapperClassName,
  legacyWrapperStyle,
  type DisplayTargetParts,
} from './legacyDisplay';
import {
  checkboxInnerHtml,
  datetimeLegacyRawHtml,
  datetimeNeedsRawHtml,
  getFieldHtml,
  switcherHtml,
  type FieldRenderCtx,
} from './fieldHtml';
import type { Language, MultiLangText } from './i18n';

export interface RenderState {
  rootSpec: SpecNode;
  data: Record<string, unknown>;
  keyPrefix: string;
  language: Language;
  t: (text: MultiLangText | undefined | null, fallback?: string) => string;
}

// ---------------------------------------------------------------------------
// shared presentation helpers
// ---------------------------------------------------------------------------

/** Legacy multiple detection (Group::determineIsArray). */
function isMultipleSpec(spec: SpecNode): boolean {
  const m = spec.multiple;
  return m === true || m === 'true' || m === 'only';
}

/** PHP-truthiness used by the group_class exist/empty switch. */
function hasData(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return String(value).length > 0;
}

/** Legacy field description (<p class="description">, nl2br, *line emphasis). */
function legacyDescriptionHtml(text: string): string {
  const bolded = text.replace(/\*(.*)\n/g, '<span class="bold">*$1</span>\n');
  return bolded.replace(/(\r\n|\n\r|\r|\n)/g, '<br />$1');
}

function descriptionTag(state: RenderState, spec: SpecNode): string {
  if (!spec.description) return '';
  const text = state.t(spec.description as MultiLangText);
  if (!text) return '';
  return `<p class="description">${legacyDescriptionHtml(text)}</p>`;
}

/** Inner form-group class string (Group::write $groupClass). */
function formGroupClassName(spec: SpecNode, dataPresent: boolean): string {
  const classes = ['form-group'];
  const gc = spec.group_class;
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
function inputGroupWrapperClassName(spec: SpecNode, rowIndex = 0): string {
  const classes = ['input-group-wrapper'];
  if (rowIndex > 0) classes.push('clone-element');
  const wc = spec.wrapper_class;
  if (typeof wc === 'string' && wc) classes.push(wc);
  return classes.join(' ');
}

/** form-element-wrapper class/style chain (no all_of in the fixtures). */
function wrapperPresentation(
  spec: SpecNode,
  parentDotPath: string,
  state: RenderState
): { className: string; style: string | undefined } {
  const conditionParts: DisplayTargetParts = resolveDisplayTargetParts(
    spec,
    parentDotPath,
    state.data,
    state.rootSpec
  );
  return {
    className: legacyWrapperClassName(spec, null, conditionParts),
    // Empty-data render: every fixture field stays visible (display_switch is
    // map-form; display_target carries condition maps) — hidden=false here,
    // condition styles (display:none/block) come from resolveDisplayTargetParts.
    style: legacyWrapperStyle(spec, null, conditionParts, false),
  };
}

function openWrapper(className: string, style: string | undefined, name: string): string {
  return (
    `<div class="${escAttr(className)}"` +
    (style ? ` style="${escAttr(style)}"` : '') +
    ` name="${escAttr(name)}">`
  );
}

// ---------------------------------------------------------------------------
// legacy multiple row buttons (Fields::addElement, multiple === true)
// ---------------------------------------------------------------------------

function addCSlashesQuote(s: string): string {
  return s.split('"').join('\\"');
}

function hasDynamicOnchange(spec: SpecNode): boolean {
  const d = spec.dynamic_onchange;
  return typeof d === 'string' && d !== '';
}

/** Raw legacy row-buttons HTML (matches FormGroup.legacyRowButtonsHtml). */
function legacyRowButtonsHtml(spec: SpecNode): string {
  const dynRaw = spec.dynamic_onchange;
  const dyn =
    typeof dynRaw === 'string' && dynRaw !== '' ? ` onclick="${addCSlashesQuote(dynRaw)}"` : '';
  const sortable = spec.sortable === true;
  const mm = spec.multiple_max;
  const max = mm !== undefined && mm !== null ? `data-multiple-max="${String(mm)}"` : '';

  let html = '';
  if (sortable) {
    html += `<button  type="button" class="btn btn-move-up"${dyn}>&nbsp;</button>`;
    html += `<button  type="button" class="btn btn-move-down"${dyn}>&nbsp;</button>`;
  }
  html += `<button class="btn btn-plus" ${max} type="button"${dyn}>&nbsp;</button>`;
  let minusBtn = 'btn-minus';
  if (spec.multiple_copy) {
    html += `<button class="btn btn-copy" type="button"${dyn}>&nbsp;</button>`;
    minusBtn = 'btn-minus btn-delete';
  }
  html += `<button class="btn ${minusBtn}" type="button"${dyn}>&nbsp;</button>`;
  return html;
}

/** React MultipleRowButtons JSX equivalent (no dynamic_onchange). */
function reactRowButtonsHtml(spec: SpecNode): string {
  const sortable = spec.sortable === true;
  const multipleMax = spec.multiple_max;
  const maxAttr =
    multipleMax !== undefined && multipleMax !== null
      ? ` data-multiple-max="${escAttr(String(multipleMax))}"`
      : '';
  let html = '';
  if (sortable) {
    html += `<button type="button" class="btn btn-move-up"> </button>`;
    html += `<button type="button" class="btn btn-move-down"> </button>`;
  }
  html += `<button type="button" class="btn btn-plus"${maxAttr}> </button>`;
  html += `<button type="button" class="btn btn-minus"> </button>`;
  return html;
}

// ---------------------------------------------------------------------------
// FormField
// ---------------------------------------------------------------------------

function stripArraySuffix(path: string, spec: SpecNode): string {
  if (isMultipleSpec(spec) && path.includes('[]')) {
    return path.split('[]').join('');
  }
  return path;
}

/** Render one property (FormField dispatcher). `name` is the spec key. */
export function renderField(
  name: string,
  spec: SpecNode,
  rawPath: string,
  parentPath: string | undefined,
  state: RenderState
): string {
  const path = stripArraySuffix(rawPath, spec);

  // group -> FormGroup
  if (spec.type === 'group') {
    return renderGroup(name, spec, path, parentPath, state);
  }

  // Multiple leaf field -> one row per key
  if (isMultipleSpec(spec)) {
    return renderMultipleLeaf(name, spec, path, parentPath, state);
  }

  const fieldType = String(spec.type ?? '');
  const value = getValueByPath(state.data, path);
  const wrapperName = wrapperLayerName(path, state.keyPrefix || undefined);
  const presentation = wrapperPresentation(spec, parentPath ?? '', state);
  const uniqid = generateUniqid();
  const label = spec.label ? state.t(spec.label as MultiLangText) : undefined;

  const ctx: FieldRenderCtx = {
    spec,
    value,
    path,
    keyPrefix: state.keyPrefix,
    language: state.language,
    t: state.t,
    readonly: spec.readonly === true,
    disabled: spec.disabled === true,
  };

  // checkbox / switcher special structure
  if (fieldType === 'checkbox' || fieldType === 'switcher') {
    const inner = fieldType === 'switcher' ? switcherHtml(ctx) : checkboxInnerHtml(ctx);
    return (
      openWrapper(presentation.className, presentation.style, wrapperName) +
      `<div class="checkbox">` +
      `<h6>` +
      `<div class="${escAttr(inputGroupWrapperClassName(spec))}" data-uniqid="${escAttr(uniqid)}">` +
      inner +
      `</div>` +
      `</h6>` +
      descriptionTag(state, spec) +
      `</div>` +
      `</div>`
    );
  }

  const labelTag =
    label && fieldType !== 'hidden'
      ? `<h6${(spec.label_class as string) ? ` class="${escAttr(spec.label_class as string)}"` : ' class=""'}>${escText(label)}</h6>`
      : '';

  // datetime raw-wrapper branch
  let innerHtml: string;
  if ((fieldType === 'datetime' || fieldType === 'datetime-local') && datetimeNeedsRawHtml(spec)) {
    innerHtml = datetimeLegacyRawHtml(ctx);
  } else {
    const fn = getFieldHtml(fieldType);
    innerHtml = fn ? fn(ctx) : '';
  }

  return (
    openWrapper(presentation.className, presentation.style, wrapperName) +
    labelTag +
    descriptionTag(state, spec) +
    `<div class="form-element">` +
    `<div class="${escAttr(inputGroupWrapperClassName(spec))}" data-uniqid="${escAttr(uniqid)}">` +
    innerHtml +
    `</div>` +
    `</div>` +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// multiple leaf field
// ---------------------------------------------------------------------------

function multipleRowKeys(value: unknown): string[] {
  if (Array.isArray(value) && value.length > 0) return value.map(() => generateUniqid());
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length > 0) return keys;
  }
  // Empty data -> a single placeholder row (PHP `[$parentId => null]`).
  return [generateUniqid()];
}

function renderMultipleLeaf(
  name: string,
  spec: SpecNode,
  path: string,
  parentPath: string | undefined,
  state: RenderState
): string {
  const fieldType = String(spec.type ?? '');
  const value = getValueByPath(state.data, path);
  const wrapperName = wrapperLayerName(path, state.keyPrefix || undefined);
  const presentation = wrapperPresentation(spec, parentPath ?? '', state);
  const label = spec.label ? state.t(spec.label as MultiLangText) : undefined;

  const showButtons = spec.multiple === true;
  const rowKeys = multipleRowKeys(value);

  const labelTag =
    label && fieldType !== 'hidden'
      ? `<h6${(spec.label_class as string) ? ` class="${escAttr(spec.label_class as string)}"` : ' class=""'}>${escText(label)}</h6>`
      : '';

  let rows = '';
  rowKeys.forEach((rowKey, rowIndex) => {
    const rowPath = `${path}.${rowKey}`;
    const ctx: FieldRenderCtx = {
      spec,
      value: getValueByPath(state.data, rowPath),
      path: rowPath,
      keyPrefix: state.keyPrefix,
      language: state.language,
      t: state.t,
      readonly: spec.readonly === true,
      disabled: spec.disabled === true,
      // React MultipleLeafField sets BOTH props on every row; the field's raw
      // branch consumes buttonsHtml, the controlled branch consumes buttons.
      buttonsHtml: showButtons ? legacyRowButtonsHtml(spec) : undefined,
      buttonsJsx: showButtons ? reactRowButtonsHtml(spec) : undefined,
    };
    const fn = getFieldHtml(fieldType);
    const inner = fn ? fn(ctx) : '';
    const wrapperStyle = styleString(spec.wrapper_style);
    rows +=
      `<div class="${escAttr(inputGroupWrapperClassName(spec, rowIndex))}" data-uniqid="${escAttr(rowKey)}"` +
      (wrapperStyle ? ` style="${escAttr(wrapperStyle)}"` : '') +
      `>${inner}</div>`;
  });

  return (
    openWrapper(presentation.className, presentation.style, wrapperName) +
    labelTag +
    descriptionTag(state, spec) +
    `<div class="form-element">${rows}</div>` +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// FormGroup
// ---------------------------------------------------------------------------

export function renderGroup(
  name: string,
  spec: SpecNode,
  path: string,
  parentPath: string | undefined,
  state: RenderState
): string {
  if (isMultipleSpec(spec)) {
    return renderMultipleGroup(name, spec, path, parentPath, state);
  }

  const wrapperName = wrapperLayerName(path, state.keyPrefix || undefined);
  const presentation = wrapperPresentation(spec, parentPath ?? '', state);
  const label = spec.label ? state.t(spec.label as MultiLangText) : undefined;
  const uniqid = generateUniqid();
  const groupValue = getValueByPath(state.data, path);
  const groupStyle = styleString(spec.group_style);
  const wrapperStyle = styleString(spec.wrapper_style);

  const labelTag = label
    ? `<h6${(spec.label_class as string) ? ` class="${escAttr(spec.label_class as string)}"` : ' class=""'}>${escText(label)}</h6>`
    : '';

  let fieldsHtml = '';
  const props = spec.properties as Record<string, SpecNode> | undefined;
  if (props) {
    for (const [fieldName, fieldSpec] of Object.entries(props)) {
      fieldsHtml += renderField(fieldName, fieldSpec, `${path}.${fieldName}`, path, state);
    }
  }

  return (
    openWrapper(presentation.className, presentation.style, wrapperName) +
    labelTag +
    descriptionTag(state, spec) +
    `<div class="form-element">` +
    `<div class="${escAttr(inputGroupWrapperClassName(spec))}" data-uniqid="${escAttr(uniqid)}"` +
    (wrapperStyle ? ` style="${escAttr(wrapperStyle)}"` : '') +
    `>` +
    `<div class="${escAttr(formGroupClassName(spec, hasData(groupValue)))}"` +
    (groupStyle ? ` style="${escAttr(groupStyle)}"` : '') +
    `>${fieldsHtml}</div>` +
    `</div>` +
    `</div>` +
    `</div>`
  );
}

function multipleGroupRowKeys(value: unknown): string[] {
  if (Array.isArray(value) && value.length > 0) return value.map(() => generateUniqid());
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length > 0) return keys;
  }
  return [generateUniqid()];
}

function renderMultipleGroup(
  name: string,
  spec: SpecNode,
  path: string,
  parentPath: string | undefined,
  state: RenderState
): string {
  const wrapperName = wrapperLayerName(path, state.keyPrefix || undefined);
  const presentation = wrapperPresentation(spec, parentPath ?? '', state);
  const label = spec.label ? state.t(spec.label as MultiLangText) : undefined;
  const value = getValueByPath(state.data, path);
  const rowKeys = multipleGroupRowKeys(value);
  const showButtons = spec.multiple === true;
  const groupStyle = styleString(spec.group_style);
  const wrapperStyle = styleString(spec.wrapper_style);

  const labelTag = label
    ? `<h6${(spec.label_class as string) ? ` class="${escAttr(spec.label_class as string)}"` : ' class=""'}>${escText(label)}</h6>`
    : '';

  const props = spec.properties as Record<string, SpecNode> | undefined;

  let rowsHtml = '';
  rowKeys.forEach((rowKey, rowIndex) => {
    const rowValue =
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)[rowKey]
        : undefined;
    let fieldsHtml = '';
    if (props) {
      for (const [fieldName, fieldSpec] of Object.entries(props)) {
        fieldsHtml += renderField(
          fieldName,
          fieldSpec,
          `${path}.${rowKey}.${fieldName.split('[]').join('')}`,
          `${path}.${rowKey}`,
          state
        );
      }
    }
    let buttonsBlock = '';
    if (showButtons) {
      if (hasDynamicOnchange(spec)) {
        buttonsBlock = `<span class="btn-group input-group-btn">${legacyRowButtonsHtml(spec)}</span>`;
      } else {
        buttonsBlock = `<span class="btn-group input-group-btn">${reactRowButtonsHtml(spec)}</span>`;
      }
    }
    rowsHtml +=
      `<div class="${escAttr(inputGroupWrapperClassName(spec, rowIndex))}" data-uniqid="${escAttr(rowKey)}"` +
      (wrapperStyle ? ` style="${escAttr(wrapperStyle)}"` : '') +
      `>` +
      `<div class="${escAttr(formGroupClassName(spec, hasData(rowValue)))}"` +
      (groupStyle ? ` style="${escAttr(groupStyle)}"` : '') +
      `>${fieldsHtml}</div>` +
      buttonsBlock +
      `</div>`;
  });

  return (
    openWrapper(presentation.className, presentation.style, wrapperName) +
    labelTag +
    descriptionTag(state, spec) +
    `<div class="form-element">${rowsHtml}</div>` +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// footer (ButtonGroup) + top label/description
// ---------------------------------------------------------------------------

function renderFooter(spec: SpecNode, state: RenderState): string {
  const buttons = spec.buttons as Array<Record<string, unknown>> | undefined;
  const addButtons = spec.add_buttons as Array<Record<string, unknown>> | undefined;
  const hasButtons = Array.isArray(buttons) && buttons.length > 0;
  const hasAddButtons = Array.isArray(addButtons) && addButtons.length > 0;

  const renderLegacyButtons = (list: Array<Record<string, unknown>>): string => {
    let html = '';
    for (const b of list) {
      const type = (b.type as string) ?? '';
      const txt = b.text !== undefined ? state.t(b.text as MultiLangText) : '';
      const cls = (b.class as string) ?? '';
      const onclick = b.onclick ? ` onclick="${b.onclick}"` : '';
      const bname = b.name ? ` name="${b.name}"` : '';
      const value = b.value ? ` value="${b.value}"` : '';
      if (type === 'a') {
        const href = (b.href as string) ?? '';
        html += `<a data-href="${href}" href="${href}" class="btn ${cls}">${txt}</a>`;
      } else {
        html += `<button type="${type}"${bname} class="btn ${cls}"${value}${onclick}>${txt}</button>`;
      }
    }
    return html;
  };

  if (hasButtons) {
    return `<hr/><div class="clearfix">${renderLegacyButtons(buttons!)}</div>`;
  }

  const submitText =
    typeof spec.submit_button_text === 'string' && spec.submit_button_text
      ? spec.submit_button_text
      : '저장';
  const listText =
    typeof spec.list_button_text === 'string' && spec.list_button_text
      ? spec.list_button_text
      : '목록';
  const showListButton = !spec.remove_list_button;

  let inner = `<input type="submit" value="${escAttr(submitText)}" class="btn btn-primary"/>`;
  if (hasAddButtons) inner += `<span>${renderLegacyButtons(addButtons!)}</span>`;
  if (showListButton) {
    inner += `<a href="../" class="btn btn-secondary float-end">${escText(listText)}</a>`;
  }
  return `<hr/><div class="clearfix">${inner}</div>`;
}

/**
 * Render the full form CONTENT (no <form> wrapper): optional top
 * label/description + hr, the .form-group field list, then the footer.
 */
export function renderFormContent(spec: SpecNode, state: RenderState): string {
  let html = '';
  const label = spec.label ? state.t(spec.label as MultiLangText) : '';
  const description = spec.description ? state.t(spec.description as MultiLangText) : '';
  if (label) html += `<label class="form-label">${escText(label)}</label>`;
  if (description) html += `<div class="form-description">${escText(description)}</div>`;
  if (spec.label || spec.description) html += `<hr/>`;

  let fieldsHtml = '';
  const props = spec.properties as Record<string, SpecNode> | undefined;
  if (props) {
    for (const [name, fieldSpec] of Object.entries(props)) {
      fieldsHtml += renderField(name, fieldSpec, name, undefined, state);
    }
  }
  html += `<div class="form-group">${fieldsHtml}</div>`;
  html += renderFooter(spec, state);
  return html;
}
