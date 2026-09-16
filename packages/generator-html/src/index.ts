import {
  buildList,
  buildOutline,
  formButtonsHtml,
  parseStyle,
  type OutlineRow,
  type OutlineState,
  type FormMessages,
  type ActionVM,
  type Affix,
  type ButtonVM,
  type BuildListOptions,
  type CellVM,
  type ControlsVM,
  type FormInstance,
  type NodeVM,
  type ListViewModel,
  buildDetail,
  listLayout,
  type BuildDetailOptions,
  type DetailViewModel,
  type UnsupportedVM,
  type WidgetModel,
  paginationPages,
} from '@crudui/generator-core';

type AnyWidget = WidgetModel | UnsupportedVM;

export type { BuildListOptions, BuildDetailOptions, FormInstance, ListViewModel, DetailViewModel } from '@crudui/generator-core';

/** Options for framework-independent list HTML rendering. */
export interface RenderListOptions extends BuildListOptions {
  /** Select the list fragment layout. */
  layout?: 'table' | 'card';
}

/*
 * Serialization. The string renderers produce the same bytes, and React's server rendering is the
 * reference, so this file writes its format: escaping, attribute names, input attribute order,
 * void elements closed with `/>`, `style` text, blocked script URLs and list image preloads. A
 * control with event attributes (`on…`) is written raw: attributes as declared, without renaming,
 * reordering or URL blocking, and void elements closed with `>`.
 */

type AttrValues = Record<string, string | boolean | undefined>;

/** Escape attribute values and text. */
function escape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

/** Escape a raw attribute value. */
function rawEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Escape raw text. */
function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function textContent(value: string, raw: boolean): string {
  return raw ? escapeText(value) : escape(value);
}

function scalar(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return value === true ? '1' : '';
}

function truthy(value: unknown): boolean {
  return value === true || (typeof value === 'string' && value !== '');
}

/** Class tokens joined by single spaces. */
function joinClass(...parts: Array<string | undefined>): string {
  return parts.join(' ').split(/\s+/).filter(Boolean).join(' ');
}

const reactAttributeNames: Record<string, string> = {
  autocomplete: 'autoComplete', readonly: 'readOnly', maxlength: 'maxLength', minlength: 'minLength', colspan: 'colSpan', rowspan: 'rowSpan',
};
const booleanAttributes = new Set(['readonly', 'disabled', 'required', 'multiple', 'autofocus']);
// The reference renderer blocks a script URL with this expression, and the control characters
// it skips are the point: a URL may hide them between the letters of the scheme.
// eslint-disable-next-line no-control-regex
const javascriptProtocol = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;

function sanitizeUrl(value: string): string {
  return javascriptProtocol.test(value)
    ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')"
    : value;
}

/**
 * A `style` attribute's text: declarations as `property:value` joined by `;`, and a repeated
 * property keeps its first position with its last value.
 */
function compactStyle(value: string): string {
  const properties = new Map<string, string>();
  for (const [property, text] of parseStyle(value)) properties.set(property, text);
  return [...properties].map(([property, text]) => `${property}:${text}`).join(';');
}

/** Attributes in declaration order; an ordinary input writes `style`, `name`, `checked` and `value` last. */
function attrs(values: AttrValues, raw = false, input = false): string {
  let output = '';
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue;
    if (!raw && input && (name === 'value' || name === 'checked' || name === 'name' || name === 'style')) continue;
    let text = scalar(value);
    if (!raw && (name === 'href' || name === 'src')) text = sanitizeUrl(text);
    if (!raw && name === 'style') {
      text = compactStyle(text);
      if (text === '') continue;
    }
    if (!raw && booleanAttributes.has(name)) text = '';
    output += ` ${raw ? name : reactAttributeNames[name] ?? name}="${raw ? rawEscape(text) : escape(text)}"`;
  }
  if (!raw && input) {
    if (values.style !== undefined) {
      const style = compactStyle(scalar(values.style));
      if (style !== '') output += ` style="${escape(style)}"`;
    }
    if (values.name !== undefined) output += ` name="${escape(scalar(values.name))}"`;
    if (truthy(values.checked)) output += ' checked=""';
    if (values.value !== undefined) output += ` value="${escape(scalar(values.value))}"`;
  }
  return output;
}

function element(tag: string, values: AttrValues = {}, body = ''): string {
  return `<${tag}${attrs(values)}>${body}</${tag}>`;
}

function inputHtml(values: AttrValues, raw = false): string {
  return `<input${attrs(values, raw, true)}${raw ? '>' : '/>'}`;
}

function hasEvent(values: AttrValues | undefined): boolean {
  return Object.keys(values ?? {}).some((name) => name.startsWith('on'));
}

function affix(value: Affix | undefined, raw: boolean): string {
  if (!value) return '';
  const values: AttrValues = {};
  if (value.class) values.class = value.class;
  if (value.style) values.style = value.style;
  return `<span${attrs(values, raw)}>${textContent(value.text ?? '', raw)}</span>`;
}

/** The main control; an ordinary control writes its `style` last. */
function control(widget: WidgetModel, raw: boolean, selection: string): string {
  let values: AttrValues = widget.attrs;
  if (!raw && values.style !== undefined) {
    const { style, ...rest } = values;
    values = { ...rest, style };
  }
  if (widget.tag === 'select') {
    const options = (widget.options ?? []).map((option) =>
      `<option${attrs({ value: option.value, ...(option.selected ? { selected: selection } : {}) }, raw)}>${textContent(option.label, raw)}</option>`).join('');
    return `<select${attrs(values, raw)}>${options}</select>`;
  }
  if (widget.tag === 'textarea') {
    // HTML parsing drops one leading newline of a textarea, so a leading newline is doubled.
    const text = widget.text ?? '';
    return `<textarea${attrs(values, raw)}>${textContent(!raw && text.startsWith('\n') ? `\n${text}` : text, raw)}</textarea>`;
  }
  return inputHtml(values, raw);
}

function choices(widget: WidgetModel): string {
  const shared: AttrValues = widget.extra?.input ?? {};
  const raw = hasEvent(shared);
  const type = widget.kind === 'choice' ? 'radio' : 'checkbox';
  const body = (widget.options ?? []).map((option) => {
    const values: AttrValues = { ...shared, type, value: option.value, autocomplete: 'off', class: 'valid-target crudui-choices__input' };
    if (option.id) values.id = option.id;
    if (type === 'radio') values['data-is-default'] = option.isDefault ? '1' : '';
    if (option.selected) values.checked = true;
    if (raw && values.checked !== undefined) values.checked = '';
    const label: AttrValues = {};
    if (option.id) label.for = option.id;
    label.class = widget.itemLabelClass ?? '';
    return inputHtml(values, raw) + `<label${attrs(label, raw)}><span>${textContent(option.label, raw)}</span></label>`;
  }).join('');
  return `<div${attrs(widget.attrs)}>${body}</div>`;
}

function widget(widget: AnyWidget): string {
  if ('unsupported' in widget) return element('div', { class: 'crudui-widget crudui-widget--unsupported', 'data-unsupported-type': widget.type });
  const raw = hasEvent(widget.attrs);
  const script = `<script nonce="">${widget.script ?? ''}</script>`;
  switch (widget.layout) {
    case 'widget':
      return `<div class="crudui-widget">${affix(widget.prepend, raw)}${control(widget, raw, '')}${affix(widget.append, raw)}</div>`;
    case 'bare':
      return control(widget, raw, '');
    case 'host-script':
      return control(widget, raw, '') + script;
    case 'choices':
      return choices(widget);
    case 'file': {
      const file = widget.extra?.file ?? {};
      const display = widget.extra?.display;
      const fileRaw = hasEvent(file);
      let body = affix(widget.prepend, fileRaw);
      if (display) {
        body += fileRaw ? `<input class="${rawEscape(display.class ?? '')}" readonly="" type="text" value="">` : inputHtml(display);
      }
      body += inputHtml(file, fileRaw);
      if (display) body += '<button class="crudui-widget__button" type="button">&nbsp;</button>';
      return `<div class="crudui-widget">${body}</div>`;
    }
    case 'display':
      if (widget.kind === 'dummy-input') return `<div class="crudui-widget">${affix(widget.prepend, false)}${control(widget, false, '')}${affix(widget.append, false)}</div>`;
      return `<div${attrs(widget.attrs)}>${widget.rawHtml ?? ''}</div>`;
    case 'search':
      return (widget.styleChrome ? `<style nonce="">${widget.styleChrome}</style>` : '') + script +
        `<div class="crudui-widget crudui-widget--search">${affix(widget.prepend, true)}${control(widget, true, 'selected')}${affix(widget.append, true)}</div>`;
    case 'button':
      return script + inputHtml(widget.extra?.hidden ?? {}) + inputHtml(widget.attrs);
    default:
      return '';
  }
}

/** `<div …>` with an optional valueless `hidden` attribute last. */
function openDiv(values: AttrValues, hidden = false): string {
  return `<div${attrs(values)}${hidden ? ' hidden=""' : ''}>`;
}

function controlsHtml(controls: ControlsVM): string {
  return element('div', { class: 'crudui-controls', role: 'group', 'aria-label': controls.label },
    controls.actions.map((action) =>
      `<button${attrs({ type: 'button', class: 'crudui-action', 'data-crudui-action': action.name, 'aria-label': action.label, 'aria-disabled': action.disabled ? 'true' : undefined })}></button>`).join(''));
}

function headerHtml(vm: NodeVM): string {
  const header = vm.header;
  const parts: string[] = [];
  if (vm.collapsible) {
    parts.push(`<button${attrs({ type: 'button', class: 'crudui-action', 'data-crudui-action': 'toggle-row', 'aria-expanded': String(vm.expanded === true), 'aria-controls': vm.body.id, 'aria-label': vm.toggleLabel })}></button>`);
  }
  if (header?.label !== undefined) {
    parts.push(header.labelFor
      ? element('label', { class: 'crudui-node__label', for: header.labelFor }, escape(header.label))
      : element('span', { class: 'crudui-node__label' }, escape(header.label)));
  }
  if (header?.description !== undefined) parts.push(element('p', { class: 'crudui-node__description' }, escape(header.description)));
  if (header?.number !== undefined) parts.push(element('span', { class: 'crudui-node__number' }, escape(header.number)));
  if (header?.title !== undefined) parts.push(element('span', { class: 'crudui-node__title' }, escape(header.title)));
  if (header?.summary !== undefined) {
    parts.push(`<span class="crudui-node__summary"${vm.expanded === true ? ' hidden=""' : ''}>${escape(header.summary)}</span>`);
  }
  if (header?.count !== undefined) parts.push(element('span', { class: 'crudui-node__count' }, escape(header.count)));
  if (vm.controls?.placement === 'header') parts.push(controlsHtml(vm.controls));
  if (!parts.length) return '';
  return element('div', { class: joinClass('crudui-node__header', header?.className), style: header?.style || undefined }, parts.join(''));
}

function bodyHtml(vm: NodeVM): string {
  let inner: string;
  if (vm.checkbox) {
    const box = vm.checkbox;
    inner = inputHtml({ class: box.className, id: box.id, name: box.name, type: 'checkbox', value: '1', ...(box.checked ? { checked: true } : {}) }) +
      element('label', { for: box.id }, escape(box.caption));
  } else if (vm.widget) {
    inner = widget(vm.widget);
  } else {
    inner = (vm.children ?? []).map(node).join('');
  }
  return openDiv({ class: joinClass('crudui-node__body', vm.body.className), style: vm.body.style, id: vm.body.id },
    vm.collapsible === true && vm.expanded !== true) + inner + '</div>';
}

function footerHtml(vm: NodeVM): string {
  return vm.controls?.placement === 'footer' ? element('div', { class: 'crudui-node__footer' }, controlsHtml(vm.controls)) : '';
}

/** Root style: the node style plus the sticky depth of a sticky row. */
function rootStyle(vm: NodeVM): string | undefined {
  return [vm.style, vm.sticky ? `--crudui-sticky-depth: ${vm.stickyDepth ?? 0}` : undefined].filter(Boolean).join('; ') || undefined;
}

/** Render one node of the recursive form grammar. */
function node(vm: NodeVM): string {
  const root = {
    class: joinClass('crudui-node', `crudui-node--${vm.kind}`, vm.sticky ? 'crudui-node--sticky' : undefined, vm.className),
    style: rootStyle(vm),
    'data-field-path': vm.kind === 'row' || vm.kind === 'lang-item' ? undefined : vm.path,
    'data-crudui-row-key': vm.key,
    'data-lang': vm.lang,
  };
  const header = headerHtml(vm);
  const headerSlot = vm.sticky && header ? element('div', { class: 'crudui-node__header-container' }, header) : header;
  return openDiv(root, vm.hidden) + headerSlot + bodyHtml(vm) + footerHtml(vm) + '</div>';
}

function cellBody(cell: CellVM): string {
  const display = cell.display;
  if (typeof display === 'string') return escape(display);
  switch (display.kind) {
    case 'badge': return element('span', { class: 'crudui-badge', ...(display.variant ? { 'data-crudui-variant': display.variant } : {}) }, escape(display.label));
    case 'link': return element('a', { href: display.href, ...(display.target ? { target: display.target } : {}) }, escape(display.text));
    case 'image': {
      const values: AttrValues = { src: display.src, alt: display.alt ?? '' };
      if (display.width !== undefined) values.width = scalar(display.width);
      if (display.height !== undefined) values.height = scalar(display.height);
      if (!display.src) delete values.src;
      return `<img${attrs(values)}/>`;
    }
    case 'bool':
      if (display.as === 'check') return element('span', { class: 'crudui-bool crudui-bool--check', 'data-crudui-state': String(display.value), 'aria-label': display.label }, display.value ? '✔' : '✘');
      if (display.as === 'icon') return element('span', { class: 'crudui-bool crudui-bool--icon', 'data-crudui-state': String(display.value), 'aria-label': display.label });
      return element('span', { class: 'crudui-bool crudui-bool--text', 'data-crudui-state': String(display.value) }, escape(display.label));
    case 'html': return display.html;
    default: return '';
  }
}

function cellHtml(cell: CellVM, tag: 'td' | 'span' | 'dd', base: string): string {
  const values: AttrValues = { class: joinClass(base, cell.design.main.class) };
  if (cell.design.main.style) values.style = cell.design.main.style;
  return element(tag, values, cellBody(cell));
}

/** Render one read-only detail field using the same display cell renderer as lists. */
function detailField(field: DetailViewModel['fields'][number]): string {
  return element('div', { class: 'crudui-detail__field' },
    element('dt', { class: 'crudui-detail__label' }, escape(field.label)) +
    cellHtml(field, 'dd', `crudui-detail__value crudui-value crudui-value--${field.format.type}`));
}

/** Compose, evaluate and render one read-only detail without a framework or database. */
export function renderDetail(
  spec: Record<string, unknown>,
  record: Record<string, unknown> = {},
  options: BuildDetailOptions = {},
): string {
  const vm = buildDetail(spec, record, options);
  const preloads = imagePreloads([{ cells: vm.fields }]);
  return preloads + element('dl', { class: joinClass('crudui-detail', vm.design.wrapper.class), style: vm.design.wrapper.style }, vm.fields.map(detailField).join(''));
}

/** A list action: a link or button written raw, with its behavior attributes. */
function action(action: ActionVM): string {
  const values: AttrValues = {};
  let tag = 'button';
  if (action.format?.type === 'link') {
    tag = 'a';
    const options = action.format.options ?? {};
    values.href = scalar(options.href) || '#';
    if (scalar(options.target) !== '') values.target = scalar(options.target);
  } else {
    values.type = 'button';
  }
  for (const [event, script] of Object.entries(action.behavior ?? {})) values[`on${event}`] = scalar(script);
  return element('span', { class: 'crudui-list__action', 'data-action': action.key }, `<${tag}${attrs(values, true)}>${escapeText(action.label)}</${tag}>`);
}

function pagination(vm: ListViewModel): string {
  if (!vm.pagination.enabled) return '';
  const values: AttrValues = { class: 'crudui-list__pagination' };
  if (vm.pagination.mode) values['data-mode'] = vm.pagination.mode;
  if (vm.pagination.perPage !== undefined) values['data-per-page'] = scalar(vm.pagination.perPage);
  if (vm.pagination.page !== undefined) values['data-page'] = scalar(vm.pagination.page);
  if (vm.pagination.total !== undefined) values['data-total'] = scalar(vm.pagination.total);
  const pageCount = vm.pagination.pageCount ?? 0;
  const page = pageCount > 0 ? Math.min(pageCount, Math.max(1, vm.pagination.page ?? 1)) : 1;
  const previous = Math.max(1, page - 1);
  const next = pageCount > 0 ? Math.min(pageCount, page + 1) : 1;
  const button = (className: string, value: number, label: string, disabled: boolean, current = false) =>
    element('button', { type: 'button', class: className, 'data-page': scalar(value), 'aria-label': label, ...(current ? { 'aria-current': 'page' } : {}), ...(disabled ? { disabled: true } : {}) }, escapeText(label === 'Previous page' ? '‹' : label === 'Next page' ? '›' : String(value)));
  const controls = button('crudui-list__pagination-prev', previous, 'Previous page', page <= 1 || pageCount === 0)
    + paginationPages(page, pageCount).map(value => button('crudui-list__pagination-page', value, `Page ${value}`, value === page, value === page)).join('')
    + button('crudui-list__pagination-next', next, 'Next page', pageCount === 0 || page >= pageCount);
  return element('nav', values, controls);
}

function listHtml(vm: ListViewModel, layout: 'table' | 'card'): string {
  let body = vm.actions.length ? `<div class="crudui-list__actions">${vm.actions.map(action).join('')}</div>` : '';
  if (!vm.rows.length) {
    body += element('div', { class: 'crudui-list__empty' }, escape(vm.empty));
  } else if (layout === 'card') {
    body += element('div', { class: 'crudui-list__cards' }, vm.rows.map((row) => element('article', { class: 'crudui-list__card' }, row.cells.map((item, index) =>
      element('div', { class: joinClass(`crudui-list__cell crudui-value crudui-value--${item.format.type}`, item.design.main.class) },
        element('span', { class: 'crudui-list__card-label' }, escape(vm.columns[index]?.label ?? '')) + cellHtml(item, 'span', 'crudui-list__card-value'))).join(''))).join(''));
  } else {
    const heads = vm.columns.map((column) => {
      const values: AttrValues = { class: joinClass('crudui-list__heading', column.design.main.class) };
      if (column.design.main.style) values.style = column.design.main.style;
      if (column.field) values['data-field'] = column.field;
      if (column.sortable) values['data-sortable'] = 'true';
      const field = vm.sort?.field ?? '';
      if (field !== '' && (field === column.field || field === column.key)) values['data-sort-dir'] = vm.sort?.dir;
      return element('th', values, element('span', { class: 'crudui-list__heading-label' }, escape(column.label)) + (column.sortable ? '<span class="crudui-list__sort">↕</span>' : ''));
    }).join('');
    const rows = vm.rows.map((row) => `<tr>${row.cells.map((item) => cellHtml(item, 'td', `crudui-list__cell crudui-value crudui-value--${item.format.type}`)).join('')}</tr>`).join('');
    body += `<table class="crudui-list__table"><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table>`;
  }
  const wrapper: AttrValues = { class: joinClass('crudui-list', vm.design.wrapper.class) };
  if (vm.design.wrapper.style) wrapper.style = vm.design.wrapper.style;
  return element('div', wrapper, body + pagination(vm));
}

/** Image resource hints in first-use order, without empty or `data:` sources. */
function imagePreloads(rows: Array<{ cells: CellVM[] }>): string {
  const seen = new Set<string>();
  let output = '';
  for (const row of rows) {
    for (const item of row.cells) {
      const display = item.display;
      if (typeof display === 'string' || display.kind !== 'image') continue;
      const source = display.src ?? '';
      if (source === '' || source.toLowerCase().startsWith('data:') || seen.has(source)) continue;
      seen.add(source);
      output += `<link${attrs({ rel: 'preload', as: 'image', href: source })}/>`;
    }
  }
  return output;
}

function textAction(name: string, label: string, disabled = false): string {
  return `<button${attrs({ type: 'button', class: 'crudui-action crudui-action--text', 'data-crudui-action': name, 'aria-disabled': disabled ? 'true' : undefined })}>${escape(label)}</button>`;
}

function outlineRow(row: OutlineRow): string {
  const select = `<button${attrs({ type: 'button', class: 'crudui-action crudui-action--text', 'data-crudui-action': 'select-row' })}>` +
    (row.number !== undefined ? element('span', { class: 'crudui-node__number' }, escape(row.number)) : '') +
    (row.title !== undefined ? element('span', { class: 'crudui-node__title' }, escape(row.title)) : '') + '</button>';
  const root = attrs({
    class: 'crudui-node crudui-node--row',
    'data-field-path': row.path,
    'data-crudui-row-key': row.key,
  });
  return `<div${root}>` +
    element('div', { class: 'crudui-node__header' }, select + (row.controls ? controlsHtml(row.controls) : '')) +
    (row.rows.length ? element('div', { class: 'crudui-node__body' }, row.rows.map(outlineRow).join('')) : '') +
    '</div>';
}

/** Render structure map markup for evaluated nodes; applications that own their data render it from `bindForm`. */
export function renderOutlineView(state: OutlineState, messages: FormMessages): string {
  const controls = element('div', { class: 'crudui-controls', role: 'group', 'aria-label': messages.formControls },
    textAction('expand-all', messages.expandAll) + textAction('collapse-all', messages.collapseAll) +
    textAction('undo', messages.undo, !state.canUndo) + textAction('redo', messages.redo, !state.canRedo));
  return element('div', { class: 'crudui-outline' },
    element('div', { class: 'crudui-outline__header' }, controls) +
    element('div', { class: 'crudui-outline__body' }, buildOutline(state.fields).map(outlineRow).join('')));
}

/** Render the structure map of a form instance with its form controls. */
export function renderOutline(form: FormInstance): string {
  return renderOutlineView(form.getSnapshot(), form.messages);
}

/** Render current data markup; applications that own their data render it directly. */
export function renderDataPanel(data: unknown, messages: FormMessages): string {
  return element('div', { class: 'crudui-data' },
    element('div', { class: 'crudui-data__header' }, escape(messages.data)) +
    element('pre', { class: 'crudui-data__body' }, escape(JSON.stringify(data, null, 2))));
}

/** Render the current submission data of a form instance. */
export function renderData(form: FormInstance): string {
  return renderDataPanel(form.getData(), form.messages);
}

/** The form footer: the form buttons in one controls group. */
function formFooterHtml(buttons: readonly ButtonVM[], messages: FormMessages): string {
  return element('div', { class: 'crudui-form__footer' },
    element('div', { class: 'crudui-controls', role: 'group', 'aria-label': messages.formActions }, formButtonsHtml(buttons)));
}

/**
 * Render the `crudui-form` block for evaluated nodes and form buttons; applications that own
 * their data render it from `bindForm` and `bindButtons`.
 */
export function renderFormView(fields: readonly NodeVM[], buttons: readonly ButtonVM[], messages: FormMessages): string {
  return element('div', { class: 'crudui-form' },
    element('div', { class: 'crudui-form__body' }, fields.map(node).join('')) +
    formFooterHtml(buttons, messages));
}

/** Render the current form instance as framework-independent HTML. */
export function renderForm(form: FormInstance): string {
  const snapshot = form.getSnapshot();
  return renderFormView(snapshot.fields, snapshot.buttons, form.messages);
}

/** Compose, evaluate and render a list without a framework or database; image preloads come first. */
export function renderList(
  spec: Record<string, unknown>,
  rows: Array<Record<string, unknown>> = [],
  options: RenderListOptions = {},
): string {
  const { layout, ...buildOptions } = options;
  const vm = buildList(spec, rows, buildOptions);
  return imagePreloads(vm.rows) + listHtml(vm, listLayout(layout));
}
