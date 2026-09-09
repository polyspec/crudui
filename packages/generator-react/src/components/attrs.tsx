/** Convert evaluated HTML attributes and inline CSS into React properties. */

import type * as React from 'react';
import type { Attrs } from '@crudui/generator-core';
import { parseStyle } from '@crudui/generator-core';

/** Apply complete CSS declarations, including priority, and remove obsolete styles. */
export function resolvedStyleProps(style: React.CSSProperties | undefined): {
  style: React.CSSProperties | undefined;
  ref: React.RefCallback<HTMLElement>;
} {
  return {
    style,
    ref(element) {
      if (!element) return;
      const declarations = Object.entries(style ?? {}).flatMap(([name, value]) => {
        const property = name.startsWith('--') ? name : name.replace(/[A-Z]/g, character => `-${character.toLowerCase()}`).replace(/^ms-/, '-ms-');
        const text = typeof value === 'string' ? value : element.style.getPropertyValue(property);
        return text ? [`${property}: ${text}`] : [];
      });
      element.removeAttribute('style');
      if (declarations.length) element.style.cssText = declarations.join('; ');
      if (!element.style.length) element.removeAttribute('style');
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
      continue;
    } else if (k === 'readonly' || k === 'disabled' || k === 'required' || k === 'multiple' || k === 'autofocus') {
      props[reactProperty(k)] = true;
    } else {
      props[reactProperty(k)] = v;
    }
  }
  return { ...props, ...resolvedStyleProps(styleObject(attrs.style)) };
}

/** Plain verbatim attrs (no value remap) — for non-value-bearing elements. */
export function plainProps(attrs: Attrs): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'style') {
      continue;
    } else if (k === 'readonly' || k === 'disabled' || k === 'required' || k === 'multiple' || k === 'autofocus') {
      props[reactProperty(k)] = true;
    } else {
      props[reactProperty(k)] = v;
    }
  }
  return { ...props, ...resolvedStyleProps(styleObject(attrs.style)) };
}

/** Convert CSS declarations to a style object, retaining the last value per property. */
export function styleObject(style?: string): React.CSSProperties | undefined {
  if (!style || !style.trim()) return undefined;
  const obj: Record<string, string> = {};
  for (const [prop, val] of parseStyle(style)) {
    // React style keys: camelCase for known props; custom props (--x) verbatim.
    const key = prop.startsWith('--')
      ? prop
      : prop.replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
    obj[key] = val;
  }
  return Object.keys(obj).length ? (obj as React.CSSProperties) : undefined;
}
