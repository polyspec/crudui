// This module runs in browsers as it is: every reader strips its types first (stripTypeScriptTypes
// of node:module), and it imports nothing.

/** A node of any kind, with the members of an element, a template and a shadow host it may have. */
export type SnapshotNode = Node & {
  namespaceURI?: string | null;
  attributes?: NamedNodeMap;
  tagName?: string;
  content?: DocumentFragment;
  shadowRoot?: ShadowRoot | null;
};

/** An attribute as its namespace, its name and its value. */
export type AttributeSnapshot = [namespace: string | null, name: string, value: string];

/** A parsed node with its attributes, its children and its template content or shadow tree. */
export type NodeSnapshot = {
  type: number;
  name: string;
  namespace: string | null;
  value: string | null;
  attributes?: AttributeSnapshot[];
  children: NodeSnapshot[];
  content?: NodeSnapshot;
  shadow?: NodeSnapshot;
};

/** The state of a form control; a member the control does not have is undefined. */
export type ControlSnapshot = {
  tag: string;
  name: string;
  type: string;
  value: string;
  defaultValue: string | undefined;
  checked: boolean | undefined;
  defaultChecked: boolean | undefined;
  selectedIndex: number | undefined;
  selected: { selected: boolean; defaultSelected: boolean }[] | undefined;
  disabled: boolean;
  readOnly: boolean | undefined;
  hidden: HTMLElement['hidden'];
};

/** A form's markup, parsed DOM, control states and submitted fields. */
export type FormSnapshot = {
  html: string;
  dom: NodeSnapshot;
  controls: ControlSnapshot[];
  fields: [string, FormDataEntryValue][];
};

/** What view containers hold: their markup and what they render. */
export type ViewsSnapshot = { html: string; dom: NodeSnapshot[][] };

/** A form snapshot whose markup and DOM are what the view containers render. */
export type RenderedFormSnapshot = Omit<FormSnapshot, 'html' | 'dom'> & ViewsSnapshot;

/** The result of comparing one category of two snapshots. */
export type Comparison = { category: string; passed: true } | { category: string; passed: false; error: string };

/** Every distinct computed style, and for each element its own, ::before and ::after style. */
export type StyleSnapshot = { values: [string, string][][]; nodes: number[][] };

/** The window of a node's document, which a detached document does not have. */
function windowOf(node: Node): Window & typeof globalThis {
  const window = node.ownerDocument?.defaultView;
  if (!window) throw new Error(`${node.nodeName} belongs to a document without a window`);
  return window;
}

/** Capture parsed nodes, retaining all attributes, text, comments and child order. */
export function domSnapshot(node: SnapshotNode): NodeSnapshot {
  const result: NodeSnapshot = {
    type: node.nodeType, name: node.nodeName, namespace: node.namespaceURI ?? null, value: node.nodeValue,
    ...node.attributes ? {
      attributes: Array.from(node.attributes, (attr): AttributeSnapshot => [attr.namespaceURI, attr.name, attr.value])
        .sort((a, b) => {
          const left = JSON.stringify(a.slice(0, 2));
          const right = JSON.stringify(b.slice(0, 2));
          return left < right ? -1 : left > right ? 1 : 0;
        }),
    } : {},
    children: Array.from(node.childNodes, domSnapshot),
  };
  if (node.tagName === 'TEMPLATE' && node.content) result.content = domSnapshot(node.content);
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
export function renderedNodes(root: HTMLElement): HTMLElement {
  const window = windowOf(root);
  const copy = root.cloneNode(true);
  if (!(copy instanceof window.HTMLElement)) throw new Error(`a copy of ${root.nodeName} is not an HTML element`);
  const walker = root.ownerDocument.createTreeWalker(
    copy, window.NodeFilter.SHOW_TEXT | window.NodeFilter.SHOW_COMMENT);
  const anchors: CharacterData[] = [];
  // The walker shows text and comments only, which are character data.
  for (let node = walker.nextNode(); node instanceof window.CharacterData; node = walker.nextNode()) {
    if (node.nodeType === window.Node.COMMENT_NODE || node.nodeValue === '') anchors.push(node);
  }
  for (const node of anchors) node.remove();
  // Only HTML, SVG and MathML elements have a style attribute that the CSS object model reads.
  const styled: (Element & ElementCSSInlineStyle)[] = [copy, ...copy.querySelectorAll<HTMLElement | SVGElement | MathMLElement>('[style]')];
  for (const element of styled) {
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
export function renderedViews(view: HTMLElement): ViewsSnapshot {
  return {
    html: Array.from(view.children, container => container.innerHTML).join(''),
    dom: Array.from(renderedNodes(view).children,
      container => Array.from(container.childNodes, domSnapshot)),
  };
}

/** Capture form HTML and live control state without changing either. */
export function formSnapshot(view: HTMLElement, form: HTMLFormElement): FormSnapshot {
  // A member that a kind of control does not have reads as undefined, as on the element itself.
  const controls = Array.from(view.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement>('input, textarea, select, button')).map((element): ControlSnapshot => ({
    tag: element.tagName,
    name: element.name,
    type: element.type,
    value: element.value,
    defaultValue: 'defaultValue' in element ? element.defaultValue : undefined,
    checked: 'checked' in element ? element.checked : undefined,
    defaultChecked: 'defaultChecked' in element ? element.defaultChecked : undefined,
    selectedIndex: 'selectedIndex' in element ? element.selectedIndex : undefined,
    selected: 'options' in element && element.options ? Array.from(element.options, option => ({ selected: option.selected, defaultSelected: option.defaultSelected })) : undefined,
    disabled: element.disabled,
    readOnly: 'readOnly' in element ? element.readOnly : undefined,
    hidden: element.hidden,
  }));
  return {
    html: view.innerHTML,
    dom: domSnapshot(view),
    controls,
    fields: Array.from(new (windowOf(form).FormData)(form)),
  };
}

/** Capture a form comparison without treating framework-owned view containers as form content. */
export function renderedFormSnapshot(view: HTMLElement, form: HTMLFormElement): RenderedFormSnapshot {
  const snapshot = formSnapshot(view, form);
  const rendered = renderedViews(view);
  return { ...snapshot, html: rendered.html, dom: rendered.dom };
}

/** Report each comparison independently; a mismatch does not stop other checks. */
export function compareSnapshots(actual: Record<string, unknown>, expected: Record<string, unknown>, keys: string[] = Object.keys(expected)): Comparison[] {
  return keys.map((key): Comparison => {
    try {
      identical(actual[key], expected[key], key);
      return { category: key, passed: true };
    } catch (error) {
      return { category: key, passed: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}

/** Capture all computed CSS properties, including generated button content. */
export function styleSnapshot(view: Element): StyleSnapshot {
  const win = windowOf(view);
  const values: [string, string][][] = [];
  const indexes = new Map<string, number>();
  const nodes = [view, ...view.querySelectorAll('*')].map(element =>
    [null, '::before', '::after'].map(pseudo => {
      const style = win.getComputedStyle(element, pseudo);
      const properties = Array.from(style, (property): [string, string] => [property, style.getPropertyValue(property)]);
      const key = JSON.stringify(properties);
      let index = indexes.get(key);
      if (index === undefined) { index = values.length; indexes.set(key, index); values.push(properties); }
      return index;
    })
  );
  return { values, nodes };
}

/** Compare complete serialized values and identify the first differing position. */
export function identical(actual: unknown, expected: unknown, label: string): void {
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

export async function snapshotHash(value: unknown): Promise<string> {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
