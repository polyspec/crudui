/**
 * v2 Vue adapter — attribute marshalling helpers.
 *
 * The core hands the adapter a flat bag of EXACT lowercase HTML attribute names
 * ({ readonly, autocomplete, 'data-name', ... }). Vue's `h()` renders an unknown
 * lowercase attribute VERBATIM (no camelCase rewrite) — and accepts a STRING
 * `style` value as-is (no CSSProperties object needed, unlike React).
 *
 * BUT `@vue/server-renderer` hardcodes two attribute coercions the React-frozen
 * parity fixture forbids: an EMPTY-string value renders as a bare attribute
 * (`data-default=""` → `data-default`), and a BOOLEAN attribute name
 * (`readonly`/`checked`/`selected`/...) renders bare regardless of value
 * (`readonly="readonly"` → `readonly`). Every leaf control carries `data-default=""`,
 * so a control rendered as a real vnode cannot match the fixture. The widget
 * layer therefore serializes such controls to a raw HTML string (raw.ts) and
 * injects them via the immediate container vnode's `innerHTML` domProp — the
 * container stays a real vnode. These helpers serve only the elements with NO
 * empty/boolean attribute (display RAW div, unsupported marker, checkbox input),
 * which render correctly as plain vnodes.
 */

import type { Attrs } from '@form-spec/generator-core';

/** Plain verbatim attrs for an element with no empty/boolean-attr hazard. */
export function plainProps(attrs: Attrs): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) {
    props[k] = v;
  }
  return props;
}
