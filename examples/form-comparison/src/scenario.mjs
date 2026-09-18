import customerSpecs from '../fixtures/customer-specs.json' with { type: 'json' };

// The benchmark form is the repeated part of the canonical record form: one declaration of the
// companies, their stores and their departments serves both.
const spec = {
  type: 'group',
  properties: { companies: customerSpecs.form.properties.companies },
  // The native completion marker is the declared submit button, rendered in the form footer.
  buttons: [{ type: 'submit', name: '_form_complete', value: '1', text: { en: 'Save', ko: '저장' } }],
};

/** Return an independent copy of the current keyed form specification. */
export function specFor() {
  return structuredClone(spec);
}
