/**
 * Replace an element's content with rendered markup while keeping every existing node that the
 * new markup still contains. A string renderer re-renders the whole form after each change;
 * patching keeps the focused control, its text selection and an input method composition, as
 * the framework renderers do.
 *
 * Nodes match by kind and element name, and elements by their identity: a row key, a field
 * path, an id, or a control name with its value for checkboxes and radio buttons. Unkeyed nodes
 * match in order. Attributes are copied from the new markup; control values and checked states
 * are live properties, which `connectForm().sync()` sets from the form.
 */
export function patchContent(element: Element, html: string): void {
  const template = element.ownerDocument.createElement('template');
  template.innerHTML = html;
  patchChildren(element, template.content);
}

function identity(node: Node): string | undefined {
  if (node.nodeType !== 1) return undefined;
  const element = node as Element;
  const row = element.getAttribute('data-crudui-row-key');
  if (row !== null) return `row:${row}`;
  const path = element.getAttribute('data-field-path');
  if (path !== null) return `path:${path}`;
  if (element.id) return `id:${element.id}`;
  const name = element.getAttribute('name');
  if (name === null) return undefined;
  const type = element.getAttribute('type');
  return type === 'checkbox' || type === 'radio' ? `name:${name}:${element.getAttribute('value') ?? ''}` : `name:${name}`;
}

const sameKind = (current: Node, next: Node) => current.nodeType === next.nodeType && current.nodeName === next.nodeName;

function patchChildren(parent: Node, source: Node): void {
  const unused: Node[] = Array.from(parent.childNodes);
  const keyed = new Map<string, Node>();
  for (const node of unused) {
    const key = identity(node);
    if (key !== undefined && !keyed.has(key)) keyed.set(key, node);
  }
  let position: Node | null = parent.firstChild;
  for (const next of Array.from(source.childNodes)) {
    const key = identity(next);
    let current: Node | undefined;
    if (key !== undefined) {
      const candidate = keyed.get(key);
      if (candidate && sameKind(candidate, next)) current = candidate;
    } else {
      current = unused.find(node => identity(node) === undefined && sameKind(node, next));
    }
    if (current) {
      unused.splice(unused.indexOf(current), 1);
      if (key !== undefined) keyed.delete(key);
      if (current !== position) parent.insertBefore(current, position);
      else position = position.nextSibling;
      patchNode(current, next);
    } else {
      parent.insertBefore(parent.ownerDocument!.importNode(next, true), position);
    }
  }
  for (const node of unused) node.parentNode?.removeChild(node);
}

function patchNode(current: Node, next: Node): void {
  if (current.nodeType !== 1) {
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    return;
  }
  const element = current as Element;
  const source = next as Element;
  for (const { name } of Array.from(element.attributes)) {
    if (!source.hasAttribute(name)) element.removeAttribute(name);
  }
  for (const { name, value } of Array.from(source.attributes)) {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  }
  const content = (node: Node) => (node.nodeName === 'TEMPLATE' ? (node as HTMLTemplateElement).content : node);
  patchChildren(content(element), content(source));
}
