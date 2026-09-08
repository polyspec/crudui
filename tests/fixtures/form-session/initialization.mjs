import { data, companyKey, storeKey } from './scenario.mjs';
import { formSnapshot } from '../../form-inspector/form-snapshot.mjs';

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
