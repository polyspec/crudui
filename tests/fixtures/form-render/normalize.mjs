import { parseFragment, serialize } from 'parse5';
import postcss from 'postcss';

const htmlNamespace = 'http://www.w3.org/1999/xhtml';
const booleanAttributes = new Set(['checked', 'selected', 'disabled', 'readonly', 'multiple', 'required', 'autofocus']);

/** Parse CSS declarations without splitting quoted values or data URLs. */
function canonicalStyle(value) {
  const root = postcss.parse(`x{${value}}`);
  return root.first.nodes.filter(node => node.type !== 'comment').map(node =>
    node.type === 'decl'
      ? `${node.prop}: ${node.value}${node.important ? ' !important' : ''}`
      : node.toString()
  ).join('; ');
}

/**
 * Compare parsed layout structure across framework serializers.
 * This does not establish exact HTML equality; the form inspector retains and
 * compares original HTML separately. Field names, IDs and values are preserved.
 */
export function normalizeHtml(html) {
  if (typeof html !== 'string') throw new TypeError('HTML must be a string');
  const fragment = parseFragment(html);
  function visit(node, preserveWhitespace = false) {
    const preserve = preserveWhitespace || ['pre', 'textarea', 'script', 'style'].includes(node.tagName);
    if (node.attrs) {
      for (const attribute of node.attrs) {
        if (node.namespaceURI === htmlNamespace && booleanAttributes.has(attribute.name)) attribute.value = '';
        if (attribute.name === 'style') attribute.value = canonicalStyle(attribute.value);
      }
      node.attrs = node.attrs.filter(attribute => !(['class', 'style'].includes(attribute.name) && attribute.value === ''));
      node.attrs.sort((a, b) => a.name.localeCompare(b.name));
    }
    if (node.childNodes) {
      node.childNodes = node.childNodes.filter(child => child.nodeName !== '#comment' &&
        (preserve || child.nodeName !== '#text' || !/^[\t\r\n ]*$/.test(child.value)));
      for (const child of node.childNodes) visit(child, preserve);
    }
    if (node.content) visit(node.content, preserve);
  }
  visit(fragment);
  return serialize(fragment);
}
