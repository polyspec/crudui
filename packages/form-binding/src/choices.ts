/**
 * The choices of the fields whose `items` is a group source, kept equal to the rows of the group in
 * the data of the controls (docs/spec/schema.md, "Choices from a repeated group"; README,
 * "Choices from a repeated group").
 */
import { compileForm, createForm, patchContent, type FormFieldTemplate, type Language } from '@polyspec/crudui-generator-core';
import { renderForm } from '@polyspec/crudui-generator-html';
import { isGroupSource } from '@polyspec/crudui-validator/internal';

import { collectData, submitted } from './data.js';
import { dataControls, isInput, isSelect, nodeOf, nodesByPath } from './nodes.js';

/** The render options of the server that the refreshed markup repeats. */
export interface ChoiceOptions {
  keyPrefix?: string;
  language?: Language;
  idPrefix?: string;
}

/** Whether a field or a field inside it declares a group source. */
function declaresSource(fields: readonly FormFieldTemplate[]): boolean {
  return fields.some(field => isGroupSource(field.spec.items) || declaresSource(field.children));
}

/** The field template of a data path: each segment after a repeated field is a row key. */
function declaration(fields: readonly FormFieldTemplate[], path: string): FormFieldTemplate | undefined {
  const segments = path.split('.');
  let list = fields;
  let found: FormFieldTemplate | undefined;
  for (let index = 0; index < segments.length; index++) {
    found = list.find(field => field.name === segments[index]);
    if (!found) return undefined;
    if (found.spec.multiple !== undefined && found.spec.multiple !== false && index + 1 < segments.length) index++;
    list = found.children;
  }
  return found;
}

/** The `crudui-node__body` child of a node. */
function bodyOf(node: Element): Element | undefined {
  return Array.from(node.children).find(child => child.classList.contains('crudui-node__body'));
}

/**
 * A function that patches the body of every field node with a group source to the body that the
 * renderer writes for the data of the controls, and keeps the selection the controls held; a
 * no-op for a specification without a group source.
 */
export function choiceRefresh(spec: Record<string, unknown>, options: ChoiceOptions): (body: HTMLElement) => void {
  const { keyPrefix, language, idPrefix } = options;
  const template = compileForm(spec, keyPrefix === undefined ? {} : { keyPrefix });
  if (!declaresSource(template.fields)) return () => {};
  const renderOptions = { ...(language === undefined ? {} : { language }), ...(idPrefix === undefined ? {} : { idPrefix }) };
  return (body) => {
    const form = createForm(template, collectData(body, keyPrefix), renderOptions);
    const rendered = body.ownerDocument.createElement('template');
    rendered.innerHTML = renderForm(form);
    const live = nodesByPath(body);
    for (const node of rendered.content.querySelectorAll('.crudui-node--field[data-field-path]')) {
      const path = node.getAttribute('data-field-path') ?? '';
      if (!isGroupSource(declaration(template.fields, path)?.spec.items)) continue;
      const target = live.get(path);
      const before = target && bodyOf(target);
      const after = bodyOf(node);
      if (!target || !before || !after) continue;
      const own = dataControls(body).filter(control => nodeOf(body, control) === target);
      const held = new Set(own.flatMap(control => submitted(control)));
      const invalid = own.some(control => control.getAttribute('aria-invalid') === 'true');
      patchContent(before, after.innerHTML);
      for (const control of dataControls(body).filter(item => nodeOf(body, item) === target)) {
        if (isSelect(control)) {
          for (const option of control.options) option.selected = held.has(option.value);
          if (!control.multiple && !Array.from(control.options).some(option => held.has(option.value))) control.selectedIndex = -1;
        } else if (isInput(control) && ['checkbox', 'radio'].includes(control.type)) {
          control.checked = held.has(control.value);
        }
        if (invalid) control.setAttribute('aria-invalid', 'true');
      }
    }
  };
}
