import { buildForm, buildField, makeTranslate } from '@crudui/generator-core';
import { composeProperties } from '@crudui/validator';
import { cacheFixture } from './cache-fixture.mjs';

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** Use only the selected original revision's public composition and field functions. */
export function originalBinding(spec, language) {
  if (__FORM_MODE__ === 'original') {
    return { build: data => buildForm(spec, { data, keyPrefix: 'form', language }) };
  }
  const fixture = cacheFixture(spec);
  const template = freeze(JSON.parse(JSON.stringify(composeProperties(fixture.source.properties, fixture.loader))));
  fixture.close();
  const t = makeTranslate(language);
  return {
    template,
    fromSerializedTemplate: true,
    referenceReads: fixture.referenceReads,
    build: data => Object.entries(template).map(([name, field]) => buildField(field, name, { data, keyPrefix: 'form', t, unsupported: 'throw' })),
  };
}
