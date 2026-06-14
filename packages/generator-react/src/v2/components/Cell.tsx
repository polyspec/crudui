/**
 * v2 React list cell — one resolved `CellVM` as a real JSX node.
 *
 * The read-side symmetric of Widget.tsx: where a write widget renders an INPUT
 * control, a read cell renders a DISPLAY node. It consumes the core's already
 * computed `CellVM` (format + raw value + display payload + per-row design) and
 * maps the §9.2 catalog display payload to markup. No evaluation, no string
 * concatenation, no input element — read-only.
 *
 * The markup is the SHARED 3-framework list contract (React/Vue/Svelte emit the
 * SAME normalized HTML — tests/fixtures/v2-list-render): a plain string for
 * text/date/number/choice-label; `<span class="badge badge-VAR">` for badge;
 * `<a>` for link; `<img>` for image; `<span class="bool-check|bool-icon|bool-text"
 * aria-label="L">` for bool; and the ONE sanctioned raw passthrough — the `html`
 * cell, injected verbatim with NO wrapper element. The cell's per-row `design`
 * maps to class/style on the `<td>`/`<span>` host. eval is never called.
 */

import * as React from 'react';
import type { CellVM } from '@form-spec/generator-core';
import { styleObject } from './attrs';

/** Render the inner display payload of one cell (no `<td>`/`<span>` host). */
export function CellBody({ cell }: { cell: CellVM }): React.ReactNode {
  const d = cell.display;

  // Plain string display (text / date / number / choice-label).
  if (typeof d === 'string') return d;

  switch (d.kind) {
    case 'badge':
      return (
        <span className={d.variant ? `badge badge-${d.variant}` : 'badge'}>{d.label}</span>
      );

    case 'link': {
      const target = d.target;
      return (
        <a href={d.href} {...(target ? { target } : {})}>
          {d.text}
        </a>
      );
    }

    case 'image':
      return (
        <img
          src={d.src}
          alt={d.alt}
          {...(d.width !== undefined ? { width: d.width } : {})}
          {...(d.height !== undefined ? { height: d.height } : {})}
        />
      );

    case 'bool': {
      // as: 'text' | 'icon' | 'check'. check renders a glyph host (✔/✘); icon an
      // empty glyph host; text the label verbatim. The label is carried on
      // aria-label for the non-text forms (shared 3-framework contract).
      if (d.as === 'check') {
        return (
          <span className="bool-check" aria-label={d.label}>
            {d.value ? '✔' : '✘'}
          </span>
        );
      }
      if (d.as === 'icon') {
        return (
          <span
            className={d.value ? 'bool-icon bool-true' : 'bool-icon bool-false'}
            aria-label={d.label}
          />
        );
      }
      return <span className="bool-text">{d.label}</span>;
    }

    case 'html':
      // The ONLY raw passthrough (sanctioned, SPEC §9.2 html cell). It is injected
      // verbatim with NO wrapper element — React's dangerouslySetInnerHTML needs a
      // host, so a <span> with a "display: contents" no-op is NOT used; instead the
      // raw html is the cell host's own inner html (see Cell below).
      return null;

    default:
      return '';
  }
}

/**
 * Per-row resolved design → host props (class + style). Cell visibility is the
 * COLUMN's job (a `design.show:false` column is dropped whole by buildList, header
 * + every cell — G1); a cell never re-hides itself via `display:none`, so the same
 * column `design.show` expression evaluated per-row against the row cannot
 * silently blank an otherwise-visible column. Per-cell conditional appearance is
 * expressed through class/style, not show (shared 3-framework contract).
 */
function cellHostProps(cell: CellVM, base: string): Record<string, unknown> {
  const cls = [base, cell.design.main.class].filter((s) => s && s.trim()).join(' ').trim();
  const props: Record<string, unknown> = {};
  if (cls) props.className = cls;
  const style = styleObject(cell.design.main.style);
  if (style) props.style = style;
  return props;
}

/**
 * One cell carrying the per-row resolved design. `as` selects the host element:
 * `td` (table layout, default) or `span` (card layout — a `<td>` is illegal
 * outside a table). The base class is `list-td list-td-TYPE` for table cells and
 * `list-card-value` for card cells. The body is identical across hosts EXCEPT the
 * html cell, whose raw markup is the host's own inner html (no wrapper element).
 */
export function Cell({
  cell,
  as = 'td',
  base,
}: {
  cell: CellVM;
  as?: 'td' | 'span';
  base?: string;
}): React.ReactElement {
  const hostBase = base ?? `list-td list-td-${cell.format.type}`;
  const props = cellHostProps(cell, hostBase);
  const d = cell.display;
  if (typeof d !== 'string' && d.kind === 'html') {
    // The sanctioned raw boundary: the cell host carries the verbatim html as its
    // own inner html (no extra wrapper) — identical to Svelte's {@html} and Vue's
    // innerHTML on the host.
    return React.createElement(as, { ...props, dangerouslySetInnerHTML: { __html: d.html } });
  }
  return React.createElement(as, props, <CellBody cell={cell} />);
}
