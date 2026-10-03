/**
 * Nodes and controls of a rendered form, found by their data attributes (form-markup.md,
 * "Blocks and attributes"). A node is a field, group, collection or lang node with
 * `data-field-path`, or a row with `data-crudui-row-key`; a lang item has no data path of its own.
 */

/** A control that can take part in the data. */
export type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const NODE = '[data-field-path], [data-crudui-row-key]';
const CONTROL = 'input[name], select[name], textarea[name]';

/** The data path of a node: its `data-field-path`, or for a row its collection's path, `.` and its key. */
export function nodePath(node: HTMLElement): string {
  const path = node.getAttribute('data-field-path');
  if (path !== null) return path;
  const collection = node.parentElement!.closest<HTMLElement>('[data-field-path]')!;
  return `${collection.getAttribute('data-field-path')}.${node.getAttribute('data-crudui-row-key')}`;
}

/** The nearest node of an element inside the form body, if any. */
export function nodeOf(body: HTMLElement, element: Element): HTMLElement | undefined {
  const node = element.closest<HTMLElement>(NODE);
  return node && body.contains(node) ? node : undefined;
}

/** Every node of the form body by its data path, in document order. */
export function nodesByPath(body: HTMLElement): Map<string, HTMLElement> {
  return new Map(Array.from(body.querySelectorAll<HTMLElement>(NODE), (node) => [nodePath(node), node]));
}

/** Whether an element is a named control of the form body. */
export function isControl(body: HTMLElement, element: EventTarget | null): element is Control {
  const candidate = element as Element | null;
  return typeof candidate?.matches === 'function' && candidate.matches(CONTROL) && (candidate as Control).name !== ''
    && nodeOf(body, candidate) !== undefined;
}

/**
 * The controls that take part in the data, in document order: named, inside a node, not
 * disabled and not a file input.
 */
export function dataControls(body: HTMLElement): Control[] {
  return Array.from(body.querySelectorAll<Control>(CONTROL))
    .filter((control) => isControl(body, control) && !control.matches(':disabled')
      && !(control.tagName === 'INPUT' && (control as HTMLInputElement).type === 'file'));
}

/** Whether a node contains a file control. */
export function containsFile(node: HTMLElement): boolean {
  return node.querySelector('input[type="file" i]') !== null;
}
