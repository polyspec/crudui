/**
 * CRUDUI Vue field dispatcher — the envelope, as a real `h()` vnode tree.
 *
 * Consumes one core `FieldViewModel` and builds the verified legacy envelope:
 * `.form-element-wrapper` (show=false → `style="display: none"`, DOM kept) >
 * `<h6>` label (omitted for hidden) + `.description` + `.form-element` >
 * `.input-group-wrapper[data-uniqid]` > widget. It dispatches the four field
 * shapes (leaf / group / multiple-leaf|group / lang) plus the checkbox/switcher
 * special envelope. Every envelope node is a real vnode; only the leaf control
 * bytes are raw (Widget.ts), injected at the container that owns them.
 *
 * Appearance/visibility come pre-evaluated from the core's ResolvedDesign; this
 * dispatcher only maps evaluated strings to class/style. eval is never called.
 * Vue accepts a STRING `style` value verbatim (no CSSProperties object).
 */

import { h, type VNode } from 'vue';
import type {
  FieldViewModel,
  RowVM,
  WidgetModel,
  UnsupportedVM,
} from '@crudui/generator-core';
import { Widget, widgetRootRaw } from './Widget';

type AnyWidget = WidgetModel | UnsupportedVM;

// ---------------------------------------------------------------------------
// envelope helpers
// ---------------------------------------------------------------------------

/** form-element-wrapper class: base + design.wrapper.class. */
function wrapperClass(vm: FieldViewModel): string {
  return ['form-element-wrapper', vm.design.wrapper.class]
    .filter((s) => s && s.trim())
    .join(' ')
    .trim();
}

/** form-element-wrapper style: 'display: none' (show=false) merged with extra. */
function wrapperStyle(vm: FieldViewModel): string | undefined {
  const hidden = vm.design.show ? '' : 'display: none';
  const extra = vm.design.wrapper.style?.trim() ?? '';
  const merged = [hidden, extra].filter((s) => s).join('; ');
  return merged || undefined;
}

/** Shared props for the .form-element-wrapper open element. */
function wrapperProps(vm: FieldViewModel): Record<string, unknown> {
  const style = wrapperStyle(vm);
  return {
    class: wrapperClass(vm),
    'data-field-path': vm.path,
    ...(style ? { style } : {}),
  };
}

/** input-group-wrapper class for a single field (leaf/group/lang). */
function inputGroupWrapperClass(vm: FieldViewModel): string {
  return ['input-group-wrapper', vm.design.wrapper.class]
    .filter((s) => s && s.trim())
    .join(' ')
    .trim();
}

function labelVNode(vm: FieldViewModel): VNode | null {
  if (!vm.label || vm.omitLabel) return null;
  const cls = vm.design.label.class;
  const style = vm.design.label.style?.trim();
  return h(
    'h6',
    {
      ...(cls ? { class: cls } : {}),
      ...(style ? { style } : {}),
    },
    vm.widget && !('unsupported' in vm.widget) && (vm.widget.attrs.id || vm.widget.extra?.file?.id)
      ? h('label', { for: vm.widget.extra?.file?.id ?? vm.widget.attrs.id }, vm.label)
      : vm.label
  );
}

function descriptionVNode(vm: FieldViewModel): VNode | null {
  if (!vm.description) return null;
  return h('p', { class: 'description' }, vm.description);
}

/** Row action buttons (plus/minus/copy/move) from multiple settings. */
function rowButtonVNodes(vm: FieldViewModel): VNode[] {
  const s = vm.multiple;
  if (!s) return [];
  const nodes: VNode[] = [];
  if (s.sortable) {
    nodes.push(h('button', { type: 'button', class: 'btn btn-move-up' }, ' '));
    nodes.push(h('button', { type: 'button', class: 'btn btn-move-down' }, ' '));
  }
  nodes.push(
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn-plus',
        ...(s.max !== undefined ? { 'data-multiple-max': String(s.max) } : {}),
      },
      ' '
    )
  );
  if (s.copy) nodes.push(h('button', { type: 'button', class: 'btn btn-copy' }, ' '));
  const minusCls = s.copy ? 'btn btn-minus btn-delete' : 'btn btn-minus';
  nodes.push(h('button', { type: 'button', class: minusCls }, ' '));
  return nodes;
}

/**
 * Render a widget into a sole-child container `.input-group-wrapper`. A widget
 * whose control sits directly under the wrapper (bare/host-script/button) is
 * serialized raw at the wrapper root via widgetRootRaw (no extra container).
 * Every other widget renders as a real container vnode child.
 */
function widgetContainerVNode(
  w: AnyWidget | undefined,
  className: string,
  uniqid: string
): VNode {
  if (w) {
    const raw = widgetRootRaw(w);
    if (raw !== null) {
      return h('div', { class: className, 'data-uniqid': uniqid, innerHTML: raw });
    }
  }
  const child = w ? Widget(w) : null;
  return h('div', { class: className, 'data-uniqid': uniqid }, child ? [child] : []);
}

// ---------------------------------------------------------------------------
// field shapes
// ---------------------------------------------------------------------------

function checkboxEnvelopeVNode(vm: FieldViewModel): VNode {
  // The checkbox input carries only non-empty/non-boolean attrs (class/name/
  // type/value="1") → it renders correctly as a real vnode.
  return h('div', wrapperProps(vm), [
    h('div', { class: 'checkbox' }, [
      h('h6', {}, [
        h('div', { class: inputGroupWrapperClass(vm), 'data-uniqid': vm.uniqid }, [
          h('div', {}, [
            h('input', {
              class: vm.checkboxClass,
              id: vm.checkboxId,
              name: vm.checkboxName,
              type: 'checkbox',
              value: '1',
              ...(vm.checkboxChecked ? { checked: true } : {}),
            }),
            h('label', { for: vm.checkboxId }, vm.label),
          ]),
        ]),
      ]),
      descriptionVNode(vm),
    ]),
  ]);
}

function leafFieldVNode(vm: FieldViewModel): VNode {
  if (vm.checkbox) return checkboxEnvelopeVNode(vm);
  return h('div', wrapperProps(vm), [
    labelVNode(vm),
    descriptionVNode(vm),
    h('div', { class: 'form-element' }, [
      widgetContainerVNode(vm.widget, inputGroupWrapperClass(vm), vm.uniqid),
    ]),
  ]);
}

function groupFieldVNode(vm: FieldViewModel): VNode {
  const groupStyle = vm.groupStyle?.trim();
  return h('div', wrapperProps(vm), [
    labelVNode(vm),
    descriptionVNode(vm),
    h('div', { class: 'form-element' }, [
      h('div', { class: inputGroupWrapperClass(vm), 'data-uniqid': vm.uniqid }, [
        h(
          'div',
          {
            class: vm.groupClass,
            ...(groupStyle ? { style: groupStyle } : {}),
          },
          (vm.children ?? []).map((c) => fieldVNode(c))
        ),
      ]),
    ]),
  ]);
}

function multipleLeafRowVNode(row: RowVM, vm: FieldViewModel): VNode {
  const children: (VNode | VNode[] | null)[] = [];
  if (row.widget) {
    const raw = widgetRootRaw(row.widget);
    if (raw !== null) {
      // Root-raw control under the row wrapper → inject + buttons as siblings is
      // impossible (innerHTML owns children); buttons are appended into the raw.
      return h('div', {
        key: row.uniqid,
        class: row.wrapperClass,
        'data-uniqid': row.uniqid,
        innerHTML: raw + rowButtonsHtml(vm),
      });
    }
    children.push(Widget(row.widget));
  }
  children.push(...rowButtonVNodes(vm));
  return h('div', { key: row.uniqid, class: row.wrapperClass, 'data-uniqid': row.uniqid }, children);
}

function multipleLeafFieldVNode(vm: FieldViewModel): VNode {
  return h('div', wrapperProps(vm), [
    labelVNode(vm),
    descriptionVNode(vm),
    h(
      'div',
      { class: 'form-element' },
      vm.rows?.length === 0
        ? [h('button', { type: 'button', class: 'btn btn-plus', 'aria-label': '+' }, ' ')]
        : (vm.rows ?? []).map((row) => multipleLeafRowVNode(row, vm))
    ),
  ]);
}

function multipleGroupRowVNode(row: RowVM, vm: FieldViewModel): VNode {
  return h('div', { key: row.uniqid, class: row.wrapperClass, 'data-uniqid': row.uniqid }, [
    h('div', { class: row.groupClass }, (row.children ?? []).map((c) => fieldVNode(c))),
    h('span', { class: 'btn-group input-group-btn' }, rowButtonVNodes(vm)),
  ]);
}

function multipleGroupFieldVNode(vm: FieldViewModel): VNode {
  return h('div', wrapperProps(vm), [
    labelVNode(vm),
    descriptionVNode(vm),
    h(
      'div',
      { class: 'form-element' },
      vm.rows?.length === 0
        ? [h('button', { type: 'button', class: 'btn btn-plus', 'aria-label': '+' }, ' ')]
        : (vm.rows ?? []).map((row) => multipleGroupRowVNode(row, vm))
    ),
  ]);
}

function langFieldVNode(vm: FieldViewModel): VNode {
  const lang = vm.lang!;
  return h('div', wrapperProps(vm), [
    labelVNode(vm),
    descriptionVNode(vm),
    h('div', { class: 'form-element' }, [
      h('div', { class: inputGroupWrapperClass(vm), 'data-uniqid': vm.uniqid }, [
        h('div', { class: lang.groupClass }, [
          lang.title ? h('div', { class: 'lang-title' }, lang.title) : null,
          ...lang.children.map((c) => langChildVNode(c.code, c.widget)),
        ]),
      ]),
    ]),
  ]);
}

/**
 * One language child: `.lang-child` > lang-code span + widget. The common widget
 * here is input-group (a real container vnode sibling of the span). A root-raw
 * widget (bare/host-script/button) has its control sit directly beside the span,
 * so the whole lang-child body (span + raw control) is serialized raw.
 */
function langChildVNode(code: string, w: AnyWidget): VNode {
  const raw = widgetRootRaw(w);
  if (raw !== null) {
    const span = `<span class="input-group-text lang-code">${escHtml(code)}</span>`;
    return h('div', { class: 'lang-child', 'data-lang': code, innerHTML: span + raw });
  }
  return h('div', { class: 'lang-child', 'data-lang': code }, [
    h('span', { class: 'input-group-text lang-code' }, code),
    Widget(w),
  ]);
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// multiple row buttons as a raw string (for root-raw multiple-leaf rows)
// ---------------------------------------------------------------------------

function rowButtonsHtml(vm: FieldViewModel): string {
  const s = vm.multiple;
  if (!s) return '';
  let html = '';
  if (s.sortable) {
    html += `<button type="button" class="btn btn-move-up"> </button>`;
    html += `<button type="button" class="btn btn-move-down"> </button>`;
  }
  const maxAttr = s.max !== undefined ? ` data-multiple-max="${s.max}"` : '';
  html += `<button type="button" class="btn btn-plus"${maxAttr}> </button>`;
  if (s.copy) html += `<button type="button" class="btn btn-copy"> </button>`;
  const minusCls = s.copy ? 'btn btn-minus btn-delete' : 'btn btn-minus';
  html += `<button type="button" class="${minusCls}"> </button>`;
  return html;
}

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

/** Dispatch one field view model to its shape vnode. */
export function fieldVNode(vm: FieldViewModel): VNode {
  switch (vm.shape) {
    case 'group':
      return groupFieldVNode(vm);
    case 'multiple-leaf':
      return multipleLeafFieldVNode(vm);
    case 'multiple-group':
      return multipleGroupFieldVNode(vm);
    case 'lang':
      return langFieldVNode(vm);
    case 'leaf':
    default:
      return leafFieldVNode(vm);
  }
}
