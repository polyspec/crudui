/**
 * The error slots of a complete form and the markup the binding writes into them.
 *
 * These slots carry no data or ARIA attribute, so this module finds them by class; it is the only
 * module that names or reads a class (form-markup.md, "Class names"). The markup equals what
 * `renderForm` writes for the same errors and form errors.
 */

const FORM_BODY = 'crudui-form__body';
const FORM_ERRORS = 'crudui-form__errors';
const FORM_ERROR = 'crudui-form__error';
const NODE_BODY = 'crudui-node__body';
const NODE_ERRORS = 'crudui-node__errors';
const NODE_ERROR = 'crudui-node__error';

/**
 * The body of the one CRUDUI form inside a form element.
 *
 * @throws {TypeError} when the form element does not contain exactly one form body.
 */
export function formBody(form: HTMLFormElement): HTMLElement {
  const bodies = form.querySelectorAll<HTMLElement>(`.${FORM_BODY}`);
  if (bodies.length !== 1) throw new TypeError('The form must contain one CRUDUI form');
  return bodies[0]!;
}

/** An errors element of one class with one paragraph of another class per text. */
function errorList(document: Document, listClass: string, itemClass: string, texts: readonly string[]): HTMLElement {
  const list = document.createElement('div');
  list.className = listClass;
  for (const text of texts) {
    const paragraph = document.createElement('p');
    paragraph.className = itemClass;
    paragraph.textContent = text;
    list.append(paragraph);
  }
  return list;
}

/** Replace the form errors before the form body; no texts leaves no errors element. */
export function writeFormErrors(body: HTMLElement, texts: readonly string[]): void {
  for (const child of Array.from(body.parentElement!.children)) {
    if (child.classList.contains(FORM_ERRORS)) child.remove();
  }
  if (texts.length) body.before(errorList(body.ownerDocument, FORM_ERRORS, FORM_ERROR, texts));
}

/** Replace a node's errors slot after its body; no messages leaves no slot. */
export function writeNodeErrors(node: HTMLElement, messages: readonly string[]): void {
  const children = Array.from(node.children);
  for (const child of children) {
    if (child.classList.contains(NODE_ERRORS)) child.remove();
  }
  if (!messages.length) return;
  const body = children.find((child) => child.classList.contains(NODE_BODY));
  if (!body) throw new TypeError(`A CRUDUI node has no body: ${node.outerHTML.slice(0, 80)}`);
  body.after(errorList(node.ownerDocument, NODE_ERRORS, NODE_ERROR, messages));
}
