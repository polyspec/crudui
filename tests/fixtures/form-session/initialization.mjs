import { renderForm } from '@crudui/generator-html';
import { data, companyKey, storeKey } from './scenario.mjs';
import { domSnapshot, formSnapshot } from '../../form-inspector/form-snapshot.mjs';

/**
 * Parsed DOM of a rendered form without the state the browser binding writes (the
 * `data-crudui-stuck` and `data-crudui-current` row marks and the scroll and end-row lengths
 * published on the connected element) and without the nodes frameworks use as rendering
 * anchors, which render nothing: comments and empty text. Attribute order is not part of
 * the DOM.
 */
function formDom(form) {
  const copy = form.cloneNode(true);
  // NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT
  const walker = copy.ownerDocument.createTreeWalker(copy, 4 | 128);
  const anchors = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === 8 || node.nodeValue === '') anchors.push(node);
  }
  for (const node of anchors) node.remove();
  for (const element of [copy, ...copy.querySelectorAll('[data-crudui-current],[data-crudui-stuck]')]) {
    element.removeAttribute('data-crudui-current');
    element.removeAttribute('data-crudui-stuck');
  }
  copy.style.removeProperty('--crudui-scroll-height');
  copy.style.removeProperty('--crudui-form-end-extent');
  copy.style.removeProperty('--crudui-form-end-top');
  if (copy.getAttribute('style') === '') copy.removeAttribute('style');
  return domSnapshot(copy);
}

/**
 * Server rendering taken over by a framework: the HTML renderer's markup, byte-identical
 * to the PHP, PHP extension, Go and Rust renderers, parsed as a server delivers it, must
 * equal the form the framework renders for the same session.
 */
export function compareServerTakeover({ element, session, expect }) {
  const server = element.ownerDocument.createElement('div');
  server.innerHTML = renderForm(session);
  expect(formDom(element.querySelector('.crudui-form'))).toEqual(formDom(server.firstElementChild));
}

/** Compare initial records with repeated injection into an already mounted form. */
export async function compareInitialization({ initial, deferred, flush, expect }) {
  const before = JSON.stringify(initial.session.template);
  const expected = formSnapshot(initial.element, initial.element);
  expect(deferred.element.querySelector('input')).toBeTruthy();
  for (let attempt = 0; attempt < 3; attempt++) {
    deferred.session.setData(data);
    await flush();
    expect(formSnapshot(deferred.element, deferred.element)).toEqual(expected);
    expect(JSON.stringify(deferred.session.getData())).toBe(JSON.stringify(initial.session.getData()));
    expect(JSON.stringify(deferred.session.template)).toBe(before);
  }
  const changed = structuredClone(data);
  changed.companies[companyKey].stores[storeKey].enabled = '';
  const inputs = [initial, deferred].map(instance => instance.element.querySelector('input[type=checkbox]'));
  for (const instance of [initial, deferred]) instance.session.setData(changed);
  await flush();
  expect(formSnapshot(deferred.element, deferred.element)).toEqual(formSnapshot(initial.element, initial.element));
  for (const instance of [initial, deferred]) instance.session.setData(data);
  await flush();
  const restored = formSnapshot(deferred.element, deferred.element);
  expect(restored).toEqual(formSnapshot(initial.element, initial.element));
  expect(restored).toEqual(expected);
  for (const [index, instance] of [initial, deferred].entries()) {
    expect(instance.element.querySelector('input[type=checkbox]')).toBe(inputs[index]);
  }
}
