/** Capture parsed nodes, retaining all attributes, text, comments and child order. */
export function domSnapshot(node) {
  const result = { type: node.nodeType, name: node.nodeName, namespace: node.namespaceURI ?? null, value: node.nodeValue };
  if (node.attributes) {
    result.attributes = Array.from(node.attributes, attr => [attr.namespaceURI, attr.name, attr.value])
      .sort((a, b) => {
        const left = JSON.stringify(a.slice(0, 2));
        const right = JSON.stringify(b.slice(0, 2));
        return left < right ? -1 : left > right ? 1 : 0;
      });
  }
  result.children = Array.from(node.childNodes, domSnapshot);
  if (node.tagName === 'TEMPLATE') result.content = domSnapshot(node.content);
  if (node.shadowRoot) result.shadow = domSnapshot(node.shadowRoot);
  return result;
}

/**
 * A detached copy of what a subtree renders: without the nodes frameworks keep as rendering
 * anchors, which render nothing (comments and empty text), and with every style attribute as
 * the CSS object model serializes its declarations, because a framework writes the declaration
 * block it computes (`name: value;`) where a server writes the block's source text
 * (`name:value`).
 */
export function renderedNodes(root) {
  const window = root.ownerDocument.defaultView;
  const copy = root.cloneNode(true);
  const walker = root.ownerDocument.createTreeWalker(
    copy, window.NodeFilter.SHOW_TEXT | window.NodeFilter.SHOW_COMMENT);
  const anchors = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === window.Node.COMMENT_NODE || node.nodeValue === '') anchors.push(node);
  }
  for (const node of anchors) node.remove();
  for (const element of [copy, ...copy.querySelectorAll('[style]')]) {
    if (element.style.cssText === '') element.removeAttribute('style');
    else element.setAttribute('style', element.style.cssText);
  }
  return copy;
}

/**
 * Capture what the view containers hold. The containers belong to the page, and a framework
 * marks the container it used to record how it started: Vue writes `data-v-app` on a container
 * it mounted and leaves a container it hydrated unmarked. That mark is not rendered content,
 * so the containers' own attributes are outside this capture. `html` keeps the markup the
 * browser held; `dom` is what the containers render.
 */
export function renderedViews(view) {
  return {
    html: Array.from(view.children, container => container.innerHTML).join(''),
    dom: Array.from(renderedNodes(view).children,
      container => Array.from(container.childNodes, domSnapshot)),
  };
}

/** Capture form HTML and live control state without changing either. */
export function formSnapshot(view, form) {
  const controls = Array.from(view.querySelectorAll('input, textarea, select, button')).map(element => ({
    tag: element.tagName,
    name: element.name,
    type: element.type,
    value: element.value,
    defaultValue: element.defaultValue,
    checked: element.checked,
    defaultChecked: element.defaultChecked,
    selectedIndex: element.selectedIndex,
    selected: element.options ? Array.from(element.options, option => ({ selected: option.selected, defaultSelected: option.defaultSelected })) : undefined,
    disabled: element.disabled,
    readOnly: element.readOnly,
    hidden: element.hidden,
  }));
  return {
    html: view.innerHTML,
    dom: domSnapshot(view),
    controls,
    fields: Array.from(new form.ownerDocument.defaultView.FormData(form)),
  };
}

/** Capture a form comparison without treating framework-owned view containers as form content. */
export function renderedFormSnapshot(view, form) {
  const snapshot = formSnapshot(view, form);
  const rendered = renderedViews(view);
  return { ...snapshot, html: rendered.html, dom: rendered.dom };
}

/** Report each comparison independently; a mismatch does not stop other checks. */
export function compareSnapshots(actual, expected, keys = Object.keys(expected)) {
  return keys.map(key => {
    try {
      identical(actual[key], expected[key], key);
      return { category: key, passed: true };
    } catch (error) {
      return { category: key, passed: false, error: error.message };
    }
  });
}

/** Capture all computed CSS properties, including generated button content. */
export function styleSnapshot(view) {
  const win = view.ownerDocument.defaultView;
  const values = [];
  const indexes = new Map();
  const nodes = [view, ...view.querySelectorAll('*')].map(element =>
    [null, '::before', '::after'].map(pseudo => {
      const style = win.getComputedStyle(element, pseudo);
      const properties = Array.from(style, property => [property, style.getPropertyValue(property)]);
      const key = JSON.stringify(properties);
      if (!indexes.has(key)) { indexes.set(key, values.length); values.push(properties); }
      return indexes.get(key);
    })
  );
  return { values, nodes };
}

/** Compare complete serialized values and identify the first differing position. */
export function identical(actual, expected, label) {
  if (actual === expected) return;
  if (typeof actual !== typeof expected) throw new Error(`${label}: expected type ${typeof expected}, actual type ${typeof actual}`);
  const a = typeof actual === 'string' ? actual : JSON.stringify(actual);
  const b = typeof expected === 'string' ? expected : JSON.stringify(expected);
  if (a === b) return;
  if (a === undefined || b === undefined) throw new Error(`${label}: expected ${b}, actual ${a}`);
  let index = 0;
  while (index < Math.min(a.length, b.length) && a[index] === b[index]) index++;
  throw new Error(`${label} differs at ${index}: expected ${JSON.stringify(b.slice(Math.max(0, index - 100), index + 180))}, actual ${JSON.stringify(a.slice(Math.max(0, index - 100), index + 180))}`);
}

export async function snapshotHash(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
