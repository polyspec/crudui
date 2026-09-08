/**
 * CRUDUI React adapter — attribute marshalling helpers.
 *
 * The core hands the adapter a flat bag of EXACT lowercase HTML attribute names
 * ({ readonly, autocomplete, onchange, 'data-name', ... }). React renders an
 * unknown lowercase attribute VERBATIM (no camelCase rewrite) — but `value`,
 * `checked`, and `<option selected>` are controlled-input props that React
 * strips/transforms unless routed through `defaultValue`/`defaultChecked`. These
 * helpers split a core Attrs bag into:
 *   - the verbatim attribute props (everything else, untouched), and
 *   - the React uncontrolled-value props (defaultValue/defaultChecked).
 *
 * The result feeds `React.createElement(tag, props)` so the SSR serializer emits
 * the legacy envelope byte-compatibly after normalization. No string-builder, no
 * dangerouslySetInnerHTML for ordinary elements (those are real JSX nodes).
 */

import type * as React from 'react';
import type { Attrs } from '@crudui/generator-core';

/** Remove the style attribute after React clears the last CSS declaration. */
export function resolvedStyleProps(style: React.CSSProperties | undefined): {
  style: React.CSSProperties | undefined;
  ref: React.RefCallback<HTMLElement>;
} {
  return {
    style,
    ref(element) {
      if (element && !style) element.removeAttribute('style');
    },
  };
}

const propertyNames: Record<string, string> = {
  class: 'className', for: 'htmlFor', readonly: 'readOnly', autocomplete: 'autoComplete',
  tabindex: 'tabIndex', maxlength: 'maxLength', minlength: 'minLength',
  colspan: 'colSpan', rowspan: 'rowSpan', autofocus: 'autoFocus',
};

function reactProperty(attribute: string): string {
  return propertyNames[attribute] ?? attribute;
}

/** Split a core attr bag into verbatim attrs + an uncontrolled `defaultValue`. */
export function inputProps(attrs: Attrs): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'value') {
      // Uncontrolled value (no onChange warning); React serializes value="...".
      props.defaultValue = v;
    } else if (k === 'style') {
      // React's style prop rejects a string → map to a CSSProperties object.
      const obj = styleObject(v);
      if (obj) props.style = obj;
    } else if (k === 'readonly' || k === 'disabled' || k === 'required' || k === 'multiple' || k === 'autofocus') {
      props[reactProperty(k)] = true;
    } else {
      props[reactProperty(k)] = v;
    }
  }
  return props;
}

/** Plain verbatim attrs (no value remap) — for non-value-bearing elements. */
export function plainProps(attrs: Attrs): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'style') {
      const obj = styleObject(v);
      if (obj) props.style = obj;
    } else if (k === 'readonly' || k === 'disabled' || k === 'required' || k === 'multiple' || k === 'autofocus') {
      props[reactProperty(k)] = true;
    } else {
      props[reactProperty(k)] = v;
    }
  }
  return props;
}

/**
 * Parse a canonical CSS string ("prop: val; prop: val") into a React style
 * object. React's `style` prop rejects a string; its serializer emits
 * `prop:val` (no space after colon). The shared normalizer canonicalizes CSS
 * declaration spacing cross-framework (a no-op: identical CSS), so any spacing
 * passes. Returns undefined for an empty/falsy string (attribute omitted).
 */
export function styleObject(style?: string): React.CSSProperties | undefined {
  if (!style || !style.trim()) return undefined;
  const obj: Record<string, string> = {};
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim();
    const val = decl.slice(idx + 1).trim();
    if (!prop || !val) continue;
    // React style keys: camelCase for known props; custom props (--x) verbatim.
    const key = prop.startsWith('--')
      ? prop
      : prop.replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
    obj[key] = val;
  }
  return Object.keys(obj).length ? (obj as React.CSSProperties) : undefined;
}
