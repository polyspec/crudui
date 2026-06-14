/**
 * CRUDUI design-slot resolver — appearance = visibility (`show`) + per-DOM-node
 * appearance map (R8). schema §3 common-role distribution; mirrors
 * validator-ts/src/schema.ts:258 DesignSlot.
 *
 * The legacy scattered meta keys (element_class/label_class/group_class/
 * wrapper_class/prepend_class/display_switch/display_target/style) are absorbed
 * into this one slot's node map. No legacy meta key is read here — the renderer
 * derives EVERY appearance value from `design` alone.
 *
 * Slot polymorphism (Slot<DesignSlot>, types.ts:90):
 *   - design === false → slot OFF: every node appearance is empty, show stays
 *     true (turning appearance off does not hide the field).
 *   - design === true / {} → default ON: no appearance, show true.
 *   - design === { ...map } → per-node appearance + optional show.
 *
 * Each appearance value (`show`/`class`/`style`, and each node's `class`/`style`)
 * is an `Evaluated` value resolved through the shared expr engine (expr.ts) —
 * literal, expression, or condition map. eval is never called.
 */

import type { PathContext } from '@crudui/validator';
import { evalShow, evalAppearance } from './expr';

/** Resolved class+style for one DOM node. */
export interface ResolvedNode {
  /** Class string for the node ('' when none). */
  class: string;
  /** Inline style string for the node ('' when none). */
  style: string;
}

/** Fully resolved design for one field at render time. */
export interface ResolvedDesign {
  /** Visibility (false → wrapper carries `display: none`, DOM kept). */
  show: boolean;
  /** Main (input) node appearance. */
  main: ResolvedNode;
  /** Label (`<h6>`) node appearance. */
  label: ResolvedNode;
  /** Wrapper (.form-element-wrapper / .input-group-wrapper) node appearance. */
  wrapper: ResolvedNode;
  /** Group (.form-group) node appearance. */
  group: ResolvedNode;
  /** Prepend (`<span class="input-group-text">`) node appearance. */
  prepend: ResolvedNode;
}

const EMPTY_NODE: ResolvedNode = { class: '', style: '' };

function emptyDesign(): ResolvedDesign {
  return {
    show: true,
    main: { ...EMPTY_NODE },
    label: { ...EMPTY_NODE },
    wrapper: { ...EMPTY_NODE },
    group: { ...EMPTY_NODE },
    prepend: { ...EMPTY_NODE },
  };
}

/** Resolve a `DesignNode` ({ class, style }) against the eval context. */
function resolveNode(
  node: unknown,
  ctx: PathContext
): ResolvedNode {
  if (node === null || node === undefined || typeof node !== 'object') {
    return { ...EMPTY_NODE };
  }
  const n = node as Record<string, unknown>;
  return {
    class: 'class' in n ? evalAppearance(n.class, ctx) : '',
    style: 'style' in n ? evalAppearance(n.style, ctx) : '',
  };
}

/**
 * Resolve a `Slot<DesignSlot>` into a `ResolvedDesign`. `false`/`true`/`{}` are
 * the no-appearance cases (show stays true); an object yields per-node values.
 */
export function resolveDesign(
  design: unknown,
  ctx: PathContext
): ResolvedDesign {
  // false (off) / true / undefined → default: no appearance, shown.
  if (design === false || design === true || design === undefined || design === null) {
    return emptyDesign();
  }
  if (typeof design !== 'object' || Array.isArray(design)) {
    return emptyDesign();
  }
  const d = design as Record<string, unknown>;
  return {
    show: 'show' in d ? evalShow(d.show, ctx) : true,
    main: {
      class: 'class' in d ? evalAppearance(d.class, ctx) : '',
      style: 'style' in d ? evalAppearance(d.style, ctx) : '',
    },
    label: resolveNode(d.label, ctx),
    wrapper: resolveNode(d.wrapper, ctx),
    group: resolveNode(d.group, ctx),
    prepend: resolveNode(d.prepend, ctx),
  };
}
