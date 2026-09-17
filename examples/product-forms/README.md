# Product forms

[한국어](README.ko.md).

These two specifications show a realistic product editor in the current grammar. They are
checked against the meta-schema and exercised by a test that composes, validates and renders
them.

- **Option form** ([option-form.yml](option-form.yml)) — a switch between a single option,
  generated option combinations and free-form options. `design.show` shows only the section the
  switch selects. The generated combinations are a `multiple: only` repeated group: its rows are
  exactly the keys the application supplies in the data (for example `__opt_a1__`), and the form
  offers no row controls for them. The free-form options are an ordinary repeated group with
  add, copy and move controls.
- **Product form** ([product-form.yml](product-form.yml)) — basic information, visibility with a
  schedule and sales hours, pricing with a discount, repeated attributes, media, the option
  section, shipping with weight rates, per-region rows (`multiple: only`) and a returns policy,
  search settings and repeated notices. Its option section is the fragment
  `(option-form.yml).properties.options`.
- **Option row** ([option-row.yml](option-row.yml)) — the field map every option row uses:
  name, sale state, list price, price, stock, visibility and item code. The price is required
  and at least 1 only while the row is on sale, and the stock field is shown only while stock is
  tracked.

A hidden field keeps its value and skips its rules, so the sample data keeps values in hidden
sections that would fail if they were shown
([validation rules](../../docs/spec/validation-rules.md#evaluation)).

| File | Contents |
| --- | --- |
| [option-row.yml](option-row.yml) | Reusable option-row field map |
| [option-form.yml](option-form.yml) | Option form specification |
| [product-form.yml](product-form.yml) | Product form specification |
| [option-valid.json](option-valid.json), [option-invalid.json](option-invalid.json) | Option form data with no error and with five errors |
| [product-valid.json](product-valid.json), [product-invalid.json](product-invalid.json) | Product form data with no error and with fourteen errors |
| [examples.test.mjs](examples.test.mjs) | Composition, validation and rendering test |

## Run

The test imports the built `@crudui/validator`, `@crudui/generator-core` and
`@crudui/generator-html` packages. From the repository root:

```sh
npm run build
node scripts/run-tests.mjs node -- examples/product-forms/examples.test.mjs
```

`node scripts/check-schema.mjs` checks the three YAML files against the meta-schema.
