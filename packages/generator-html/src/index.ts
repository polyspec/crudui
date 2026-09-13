import {
  buildList,
  buildOutline,
  formButtonsHtml,
  parseStyle,
  type OutlineRow,
  type OutlineState,
  type FormMessages,
  type ActionVM,
  type ButtonVM,
  type Attrs,
  type BuildListOptions,
  type CellVM,
  type ControlsVM,
  type FormInstance,
  type NodeVM,
  type ListViewModel,
  type UnsupportedVM,
  type WidgetModel,
} from '@crudui/generator-core';

type AnyWidget = WidgetModel | UnsupportedVM;

export type { BuildListOptions, FormInstance, ListViewModel } from '@crudui/generator-core';

/** Options for framework-independent list HTML rendering. */
export interface RenderListOptions extends BuildListOptions {
  /** Select the list fragment layout. */
  layout?: 'table' | 'card';
}

function escAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/'/g, '&#x27;');
}

function escText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderedStyle(value: string | undefined): string | undefined {
  const declarations = parseStyle(value ?? '');
  return declarations.length
    ? declarations.map(([property, text]) => `${property}: ${text}`).join('; ')
    : undefined;
}

function attrs(values: Attrs | Record<string, string | undefined>): string {
  let output = '';
  for (const [name, raw] of Object.entries(values)) {
    if (raw === undefined || raw === null) continue;
    const value = name === 'style' ? renderedStyle(raw) : raw;
    if (value !== undefined && !(name === 'style' && value === '')) output += ` ${name}="${escAttr(value)}"`;
  }
  return output;
}

function element(tag: string, values: Attrs | Record<string, string | undefined> = {}, body = ''): string {
  return `<${tag}${attrs(values)}>${body}</${tag}>`;
}

function input(values: Attrs | Record<string, string | undefined>, checked = false): string {
  return `<input${attrs(values)}${checked ? ' checked=""' : ''}>`;
}

function hasEvent(values: Attrs | undefined): boolean {
  return Object.keys(values ?? {}).some((name) => /^on[a-z]/.test(name));
}

function affix(value: WidgetModel['prepend']): string {
  if (!value) return '';
  return element('span', { class: value.class, style: value.style }, escText(value.text));
}

function rawAffix(value: WidgetModel['prepend']): string {
  return affix(value);
}

function optionHtml(option: NonNullable<WidgetModel['options']>[number], selectedMode: 'empty' | 'selected'): string {
  return element(
    'option',
    { value: option.value, ...(option.selected ? { selected: selectedMode === 'selected' ? 'selected' : '' } : {}) },
    escText(option.label),
  );
}

function control(widget: WidgetModel, selectedMode: 'empty' | 'selected' = 'empty'): string {
  const widgetAttrs = widget.attrs;
  if (widget.tag === 'textarea') {
    return element('textarea', widgetAttrs, escText(widget.text ?? ''));
  }
  if (widget.tag === 'select') {
    return element('select', widgetAttrs, (widget.options ?? []).map((option) => optionHtml(option, selectedMode)).join(''));
  }
  return input(widgetAttrs);
}

function rawControl(widget: WidgetModel, selectedMode: 'empty' | 'selected' = 'empty'): string {
  return control(widget, selectedMode);
}

function groupButton(option: NonNullable<WidgetModel['options']>[number], widget: WidgetModel, raw: boolean): string {
  const type = widget.kind === 'choice' ? 'radio' : 'checkbox';
  const shared: Attrs = { ...(widget.extra?.input ?? {}), type, value: option.value, autocomplete: 'off', class: 'valid-target btn-check', ...(option.id ? { id: option.id } : {}) };
  if (type === 'radio') shared['data-is-default'] = option.isDefault ? '1' : '';
  const inputHtml = input(shared, option.selected);
  const label = element('label', { for: option.id, class: widget.itemLabelClass ?? '' }, element('span', {}, escText(option.label)));
  return raw ? inputHtml + label : inputHtml + label;
}

function widget(widget: AnyWidget): string {
  if ('unsupported' in widget) return element('div', { class: 'form-element-unsupported', 'data-unsupported-type': widget.type });
  const rawAttrs = hasEvent(widget.attrs);
  switch (widget.layout) {
    case 'input-group':
      return element('div', { class: 'input-group' }, rawAttrs ? rawAffix(widget.prepend) + rawControl(widget) + rawAffix(widget.append) : affix(widget.prepend) + control(widget) + affix(widget.append));
    case 'bare':
      return rawAttrs ? rawControl(widget) : control(widget);
    case 'host-script':
      return (rawAttrs ? rawControl(widget) : control(widget)) + element('script', { nonce: '' }, widget.script ?? '');
    case 'btn-group':
      return element('div', widget.attrs, (widget.options ?? []).map((option) => groupButton(option, widget, hasEvent(widget.extra?.input))).join(''));
    case 'file': {
      const fileAttrs = widget.extra?.file ?? {};
      const display = widget.extra?.display;
      const fileRaw = hasEvent(fileAttrs);
      let body = affix(widget.prepend);
      if (display) body += input(fileRaw ? { class: display.class ?? '', readonly: '', type: 'text', value: '' } : display);
      body += input(fileAttrs);
      if (display) body += element('button', { class: 'btn btn-search btn-file-search', type: 'button' }, '&nbsp;');
      return element('div', { class: 'input-group' }, body);
    }
    case 'display':
      if (widget.kind === 'dummy-input') return element('div', { class: 'input-group' }, affix(widget.prepend) + control(widget) + affix(widget.append));
      return element('div', widget.attrs, widget.rawHtml ?? '');
    case 'search':
      return (widget.styleChrome ? element('style', { nonce: '' }, widget.styleChrome) : '') +
        element('script', { nonce: '' }, widget.script ?? '') +
        element('div', { class: 'input-group field-search' }, rawAffix(widget.prepend) + rawControl(widget, 'selected') + rawAffix(widget.append));
    case 'button':
      return element('script', { nonce: '' }, widget.script ?? '') + input(widget.extra?.hidden ?? {}) + input(widget.attrs);
    default:
      return '';
  }
}

function classes(...parts: Array<string | undefined | false>): string {
  return parts.filter((part): part is string => typeof part === 'string' && part !== '').join(' ');
}

/** `<div …>` with an optional valueless `hidden` attribute last. */
function openDiv(values: Record<string, string | undefined>, hidden = false): string {
  return `<div${attrs(values)}${hidden ? ' hidden=""' : ''}>`;
}

function controlsHtml(controls: ControlsVM): string {
  return element('div', { class: 'crudui-controls', role: 'group', 'aria-label': controls.label },
    controls.actions.map((action) =>
      `<button${attrs({ type: 'button', class: 'crudui-action', 'data-crudui-action': action.name, 'aria-label': action.label })}${action.disabled ? ' disabled=""' : ''}></button>`).join(''));
}

function headerHtml(vm: NodeVM): string {
  const header = vm.header;
  const parts: string[] = [];
  if (vm.collapsible) {
    parts.push(`<button${attrs({ type: 'button', class: 'crudui-action', 'data-crudui-action': 'toggle-row', 'aria-expanded': String(vm.expanded === true), 'aria-controls': vm.body.id, 'aria-label': vm.toggleLabel })}></button>`);
  }
  if (header?.label !== undefined) {
    parts.push(header.labelFor
      ? element('label', { class: 'crudui-node__label', for: header.labelFor }, escText(header.label))
      : element('span', { class: 'crudui-node__label' }, escText(header.label)));
  }
  if (header?.description !== undefined) parts.push(element('p', { class: 'crudui-node__description' }, escText(header.description)));
  if (header?.number !== undefined) parts.push(element('span', { class: 'crudui-node__number' }, escText(header.number)));
  if (header?.title !== undefined) parts.push(element('span', { class: 'crudui-node__title' }, escText(header.title)));
  if (header?.summary !== undefined) {
    parts.push(`<span class="crudui-node__summary"${vm.expanded ? ' hidden=""' : ''}>${escText(header.summary)}</span>`);
  }
  if (header?.count !== undefined) parts.push(element('span', { class: 'crudui-node__count' }, escText(header.count)));
  if (vm.controls?.placement === 'header') parts.push(controlsHtml(vm.controls));
  if (!parts.length) return '';
  return element('div', { class: classes('crudui-node__header', header?.className), style: header?.style || undefined }, parts.join(''));
}

function bodyHtml(vm: NodeVM): string {
  let inner: string;
  if (vm.checkbox) {
    const box = vm.checkbox;
    inner = input({ class: box.className, id: box.id, name: box.name, type: 'checkbox', value: '1' }, box.checked) +
      element('label', { for: box.id }, escText(box.caption));
  } else if (vm.widget) {
    inner = widget(vm.widget);
  } else {
    inner = (vm.children ?? []).map(node).join('');
  }
  return openDiv({ class: classes('crudui-node__body', vm.body.className), style: vm.body.style, id: vm.body.id },
    vm.collapsible === true && vm.expanded !== true) + inner + '</div>';
}

function footerHtml(vm: NodeVM): string {
  return vm.controls?.placement === 'footer' ? element('div', { class: 'crudui-node__footer' }, controlsHtml(vm.controls)) : '';
}

/** Render one node of the recursive form grammar. */
/** Root style: the node style plus the sticky depth of a sticky row. */
function rootStyle(vm: NodeVM): string | undefined {
  return [vm.style, vm.sticky ? `--crudui-sticky-depth: ${vm.stickyDepth ?? 0}` : undefined].filter(Boolean).join('; ') || undefined;
}

function node(vm: NodeVM): string {
  const root = {
    class: classes('crudui-node', `crudui-node--${vm.kind}`, vm.sticky && 'crudui-node--sticky', vm.className),
    style: rootStyle(vm),
    'data-field-path': vm.kind === 'row' || vm.kind === 'lang-item' ? undefined : vm.path,
    'data-crudui-row-key': vm.key,
    'data-lang': vm.lang,
  };
  return openDiv(root, vm.hidden) + headerHtml(vm) + bodyHtml(vm) + footerHtml(vm) + '</div>';
}

function cellBody(cell: CellVM): string {
  const display = cell.display;
  if (typeof display === 'string') return escText(display);
  switch (display.kind) {
    case 'badge': return element('span', { class: display.variant ? `badge badge-${display.variant}` : 'badge' }, escText(display.label));
    case 'link': return element('a', { href: safeUrl(display.href), ...(display.target ? { target: display.target } : {}) }, escText(display.text));
    case 'image': return element('img', { src: safeUrl(display.src), alt: display.alt, ...(display.width ? { width: display.width } : {}), ...(display.height ? { height: display.height } : {}) });
    case 'bool':
      if (display.as === 'check') return element('span', { class: 'bool-check', 'aria-label': display.label }, display.value ? '✔' : '✘');
      if (display.as === 'icon') return element('span', { class: display.value ? 'bool-icon bool-true' : 'bool-icon bool-false', 'aria-label': display.label });
      return element('span', { class: 'bool-text' }, escText(display.label));
    case 'html': return display.html;
    default: return '';
  }
}

function safeUrl(value: string): string {
  const prefix = [...value].filter((character) => {
    const code = character.charCodeAt(0);
    return code > 0x1f && code !== 0x20;
  }).join('').toLowerCase();
  if (prefix.startsWith('javascript:')) {
    return "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')";
  }
  return value;
}

function cell(cell: CellVM, tag: 'td' | 'span' | 'div' = 'td', base?: string): string {
  const className = [base ?? `list-td list-td-${cell.format.type}`, cell.design.main.class].filter(Boolean).join(' ');
  return element(tag, { class: className, style: cell.design.main.style }, cellBody(cell));
}

function action(action: ActionVM): string {
  const behavior = Object.entries(action.behavior ?? {}).map(([event, script]) => ` on${escAttr(event)}="${escAttr(script)}"`).join('');
  const common = { class: action.design?.main.class, style: action.design?.main.style };
  const body = action.format?.type === 'link'
    ? `<a href="${escAttr(safeUrl(typeof action.format.options.href === 'string' ? action.format.options.href : '#'))}"${action.format.options.target ? ` target="${escAttr(String(action.format.options.target))}"` : ''}${attrs(common)}${behavior}>${escText(action.label)}</a>`
    : `<button type="button"${attrs(common)}${behavior}>${escText(action.label)}</button>`;
  return element('span', { class: 'list-action', 'data-action': action.key }, body);
}

function pagination(vm: ListViewModel): string {
  if (!vm.pagination.enabled) return '';
  return element('nav', {
    class: 'list-pagination',
    ...(vm.pagination.mode ? { 'data-mode': vm.pagination.mode } : {}),
    ...(vm.pagination.perPage === undefined ? {} : { 'data-per-page': String(vm.pagination.perPage) }),
    ...(vm.pagination.page === undefined ? {} : { 'data-page': String(vm.pagination.page) }),
    ...(vm.pagination.total === undefined ? {} : { 'data-total': String(vm.pagination.total) }),
  });
}

function sortDir(vm: ListViewModel, field: string, key: string): string | undefined {
  if (!vm.sort || (vm.sort.field !== field && vm.sort.field !== key)) return undefined;
  return vm.sort.dir;
}

function listHtml(vm: ListViewModel, layout: 'table' | 'card'): string {
  const toolbar = vm.actions.length ? element('div', { class: 'list-actions' }, vm.actions.map(action).join('')) : '';
  let body: string;
  if (!vm.rows.length) {
    body = element('div', { class: 'list-empty' }, escText(vm.empty));
  } else if (layout === 'card') {
    body = element('div', { class: 'list-cards' }, vm.rows.map((row) => element('article', { class: 'list-card' }, row.cells.map((item, index) => element('div', { class: ['list-td', `list-td-${item.format.type}`, item.design.main.class].filter(Boolean).join(' '), style: item.design.main.style }, element('span', { class: 'list-card-label' }, escText(vm.columns[index]?.label ?? '')) + cell(item, 'span', 'list-card-value'))).join(''))).join(''));
  } else {
    const heads = vm.columns.map((column) => element('th', {
      class: ['list-th', column.design.main.class].filter(Boolean).join(' '),
      style: column.design.main.style,
      ...(column.field ? { 'data-field': column.field } : {}),
      ...(column.sortable ? { 'data-sortable': 'true' } : {}),
      ...(sortDir(vm, column.field, column.key) ? { 'data-sort-dir': sortDir(vm, column.field, column.key) } : {}),
    }, element('span', { class: 'list-th-label' }, escText(column.label)) + (column.sortable ? element('span', { class: 'list-sort' }, '↕') : ''))).join('');
    const rows = vm.rows.map((row) => element('tr', {}, row.cells.map((item) => cell(item)).join(''))).join('');
    body = element('table', { class: 'list-table' }, element('thead', {}, element('tr', {}, heads)) + element('tbody', {}, rows));
  }
  return element('div', { class: ['list-view', vm.design.wrapper.class].filter(Boolean).join(' '), style: vm.design.wrapper.style }, toolbar + body + pagination(vm));
}

function textAction(name: string, label: string, disabled = false): string {
  return `<button${attrs({ type: 'button', class: 'crudui-action crudui-action--text', 'data-crudui-action': name })}${disabled ? ' disabled=""' : ''}>${escText(label)}</button>`;
}

function outlineRow(row: OutlineRow): string {
  const select = `<button${attrs({ type: 'button', class: 'crudui-action crudui-action--text', 'data-crudui-action': 'select-row' })}>` +
    (row.number !== undefined ? element('span', { class: 'crudui-node__number' }, escText(row.number)) : '') +
    (row.title !== undefined ? element('span', { class: 'crudui-node__title' }, escText(row.title)) : '') + '</button>';
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
    textAction('undo', messages.undo, !state.canUndo));
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
    element('div', { class: 'crudui-data__header' }, escText(messages.data)) +
    element('pre', { class: 'crudui-data__body' }, escText(JSON.stringify(data, null, 2))));
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

/** Render the current form instance as framework-independent HTML. */
export function renderForm(form: FormInstance): string {
  const snapshot = form.getSnapshot();
  return element('div', { class: 'crudui-form' },
    element('div', { class: 'crudui-form__body' }, snapshot.fields.map(node).join('')) +
    formFooterHtml(snapshot.buttons, form.messages));
}

/** Compose, evaluate and render a list without a framework or database. */
export function renderList(
  spec: Record<string, unknown>,
  rows: Array<Record<string, unknown>> = [],
  options: RenderListOptions = {},
): string {
  const { layout = 'table', ...buildOptions } = options;
  return listHtml(buildList(spec, rows, buildOptions), layout);
}
