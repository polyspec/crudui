import {
  buildList,
  parseStyle,
  type ActionVM,
  type Attrs,
  type BuildListOptions,
  type CellVM,
  type FieldViewModel,
  type FormInstance,
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

function rowButtons(settings: FieldViewModel['multiple']): string {
  if (!settings) return '';
  const out: string[] = [];
  const button = (className: string, extra: Attrs = {}) => element('button', { type: 'button', class: className, ...extra }, ' ');
  if (settings.sortable) {
    out.push(button('btn btn-move-up'), button('btn btn-move-down'));
  }
  out.push(button('btn btn-plus', settings.max === undefined ? {} : { 'data-multiple-max': String(settings.max) }));
  if (settings.copy) out.push(button('btn btn-copy'));
  out.push(button(settings.copy ? 'btn btn-minus btn-delete' : 'btn btn-minus'));
  return out.join('');
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

function wrapperAttrs(vm: FieldViewModel): Attrs {
  const style = renderedStyle([vm.design.show ? '' : 'display: none', vm.design.wrapper.style].filter(Boolean).join('; '));
  return { class: ['form-element-wrapper', vm.design.wrapper.class].filter(Boolean).join(' '), 'data-field-path': vm.path, ...(style ? { style } : {}) };
}

function groupClass(vm: FieldViewModel): string {
  return ['input-group-wrapper', vm.design.wrapper.class].filter(Boolean).join(' ');
}

function fieldLabel(vm: FieldViewModel): string {
  if (!vm.label || vm.omitLabel) return '';
  const labelAttrs = { class: vm.design.label.class, style: vm.design.label.style };
  const id = vm.widget && !('unsupported' in vm.widget) ? vm.widget.extra?.file?.id ?? vm.widget.attrs.id : undefined;
  const body = id ? element('label', { for: id }, escText(vm.label)) : escText(vm.label);
  return element('h6', labelAttrs, body);
}

function description(vm: FieldViewModel): string {
  return vm.description ? element('p', { class: 'description' }, escText(vm.description)) : '';
}

function widgetContainer(widgetValue: AnyWidget | undefined, className: string, uniqid?: string, language?: string, buttons?: FieldViewModel['multiple']): string {
  const body = (language === undefined ? '' : element('span', { class: 'input-group-text lang-code' }, escText(language))) +
    (widgetValue ? widget(widgetValue) : '') + rowButtons(buttons);
  return element('div', { class: className, ...(uniqid === undefined ? {} : { 'data-uniqid': uniqid }), ...(language === undefined ? {} : { 'data-lang': language }) }, body);
}

function field(vm: FieldViewModel): string {
  if (vm.checkbox) {
    const checked = vm.checkboxChecked === true;
    const check = input({ class: vm.checkboxClass, id: vm.checkboxId, name: vm.checkboxName, type: 'checkbox', value: '1' }, checked) +
      element('label', { for: vm.checkboxId }, escText(vm.label ?? ''));
    return element('div', wrapperAttrs(vm), element('div', { class: 'checkbox' }, element('h6', {}, element('div', { class: groupClass(vm), 'data-uniqid': vm.uniqid }, element('div', {}, check))) + description(vm)));
  }
  let body: string;
  switch (vm.shape) {
    case 'group':
      body = element('div', { class: groupClass(vm), 'data-uniqid': vm.uniqid }, element('div', { class: vm.groupClass, style: vm.groupStyle }, (vm.children ?? []).map(field).join('')));
      break;
    case 'multiple-leaf':
      body = (vm.rows ?? []).map((row) => widgetContainer(row.widget, row.wrapperClass, row.uniqid, undefined, vm.multiple)).join('');
      if ((vm.rows ?? []).length === 0) body = element('button', { type: 'button', class: 'btn btn-plus', 'aria-label': '+' }, ' ');
      break;
    case 'multiple-group':
      body = (vm.rows ?? []).map((row) => element('div', { class: row.wrapperClass, 'data-uniqid': row.uniqid }, element('div', { class: row.groupClass }, (row.children ?? []).map(field).join('')) + element('span', { class: 'btn-group input-group-btn' }, rowButtons(vm.multiple)))).join('');
      if ((vm.rows ?? []).length === 0) body = element('button', { type: 'button', class: 'btn btn-plus', 'aria-label': '+' }, ' ');
      break;
    case 'lang':
      body = element('div', { class: groupClass(vm), 'data-uniqid': vm.uniqid }, element('div', { class: vm.lang?.groupClass }, (vm.lang?.title ? element('div', { class: 'lang-title' }, escText(vm.lang.title)) : '') + (vm.lang?.children ?? []).map((child) => widgetContainer(child.widget, 'lang-child', undefined, child.code)).join('')));
      break;
    case 'leaf':
    default:
      body = widgetContainer(vm.widget, groupClass(vm), vm.uniqid);
      break;
  }
  return element('div', wrapperAttrs(vm), fieldLabel(vm) + description(vm) + element('div', { class: 'form-element' }, body));
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

/** Render the current form instance as framework-independent HTML. */
export function renderForm(form: FormInstance): string {
  return element('div', { class: 'form-group' }, form.getSnapshot().fields.map(field).join(''));
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
