/**
 * Visibility and data-only collection cases written from docs/spec/validation-rules.md
 * ("Evaluation", "Conditional parameters"), docs/spec/schema.md and docs/spec/form-runtime.md.
 *
 * Each case carries its complete result record. The records are written from the
 * specification with the default rule messages below, never from a runtime's answer.
 */

/** Default message of each rule; `{0}` and `{1}` are the rule parameters. */
export const DEFAULT_MESSAGES: Record<string, string> = {
  required: 'This field is required.',
  email: 'Please enter a valid email address.',
  url: 'Please enter a valid URL.',
  minlength: 'Please enter at least {0} characters.',
  maxlength: 'Please enter no more than {0} characters.',
  rangelength: 'Please enter a value between {0} and {1} characters.',
  number: 'Please enter a valid number.',
  digits: 'Please enter only digits.',
  min: 'Please enter a value greater than or equal to {0}.',
  max: 'Please enter a value less than or equal to {0}.',
  range: 'Please enter a value between {0} and {1}.',
  step: 'Please enter a value that is a multiple of {0}.',
  match: 'Please enter a valid format.',
  pattern: 'Please enter a valid format.',
  equalTo: 'Please enter the same value again.',
  notEqual: 'Please enter a different value.',
  in: 'Please select a valid option.',
  date: 'Please enter a valid date.',
  dateISO: 'Please enter a valid date in ISO format (YYYY-MM-DD).',
  enddate: 'End date must be after the start date.',
  mincount: 'Please select at least {0} items.',
  maxcount: 'Please select no more than {0} items.',
  unique: 'Values must be unique.',
  accept: 'Please upload a file with a valid format.',
};

interface ErrorRecord {
  path: string;
  field: string;
  rule: string;
  message: string;
  value: unknown;
}

export interface WrittenCase {
  name: string;
  note: string;
  spec: Record<string, unknown>;
  data: Record<string, unknown>;
  expected: { valid: boolean; errors: ErrorRecord[] };
}

/** One error record: the field is the last path segment. */
function error(path: string, rule: string, value: unknown, ...params: unknown[]): ErrorRecord {
  const template = DEFAULT_MESSAGES[rule];
  if (template === undefined) throw new Error(`No default message for ${rule}`);
  const message = params.reduce<string>((text, param, index) => text.replace(`{${index}}`, String(param)), template);
  return { path, field: path.split('.').at(-1)!, rule, message, value };
}

const result = (...errors: ErrorRecord[]) => ({ valid: errors.length === 0, errors });

/** Fields that each fail a different rule while visible. */
function failingFields(show: unknown): Record<string, unknown> {
  return {
    name: { type: 'text', design: { show }, validate: { required: true } },
    code: { type: 'text', design: { show }, validate: { required: true, pattern: '^[a-z]+$' } },
    title: { type: 'text', design: { show }, validate: { minlength: 3, maxlength: 10 } },
    amount: { type: 'number', design: { show }, validate: { min: 1 } },
    contact: { type: 'email', design: { show }, validate: { email: true } },
    tags: { type: 'text', multiple: true, design: { show }, validate: { mincount: 2 } },
  };
}
const failingValues = { name: '', code: 'x!', title: 'ab', amount: 'abc', contact: 'not-an-address', tags: { __t1__: 'one' } };

/** A flag and a group shown only when the flag is 1. */
const toggleSpec = {
  type: 'group',
  properties: {
    is_display: { type: 'text' },
    display: {
      type: 'group',
      design: { show: '.is_display == 1' },
      properties: {
        code: { type: 'text', validate: { required: true, pattern: '^[A-Z]{3}$' } },
        title: { type: 'text', validate: { required: true, maxlength: 10 } },
      },
    },
  },
};
const invalidDisplay = { code: 'abc1', title: '' };

/** A data-only repeated group with a required name and a non-negative price per row. */
const onlyRows = (multiple: unknown, validate?: Record<string, unknown>) => ({
  type: 'group',
  properties: {
    variants: {
      type: 'group',
      multiple,
      ...(validate ? { validate } : {}),
      properties: {
        name: { type: 'text', validate: { required: true } },
        price: { type: 'number', validate: { min: 0 } },
      },
    },
  },
});

/** A case whose data or specification fails before validation. */
export interface FailingCase {
  name: string;
  note: string;
  spec: Record<string, unknown>;
  data: Record<string, unknown>;
  expectFailure: { code: string; message: string; at: string };
}

export const VISIBILITY_CASES: Array<WrittenCase | FailingCase> = [
  {
    name: 'visibility-condition-map-without-selection',
    note: 'Only a resolved false hides a field: a condition map that selects nothing leaves the field visible.',
    spec: {
      type: 'group',
      properties: {
        mode: { type: 'text' },
        unselected: { type: 'text', design: { show: { ".mode == 'on'": false } }, validate: { required: true } },
      },
    },
    data: { mode: 'off', unselected: '' },
    expected: result(error('unselected', 'required', '')),
  },
  {
    name: 'visibility-literal-string-show',
    note: 'A design.show string that is not a valid expression is a literal, and only false hides: the field is visible.',
    spec: {
      type: 'group',
      properties: {
        literal: { type: 'text', design: { show: '.mode == (' }, validate: { required: true } },
      },
    },
    data: { literal: '' },
    expected: result(error('literal', 'required', '')),
  },
  {
    name: 'visibility-hidden-data-shape',
    note: 'The data shape is an input contract, checked whether or not the field is visible.',
    spec: {
      type: 'group',
      properties: {
        items: { type: 'group', multiple: true, design: { show: false }, properties: { code: { type: 'text' } } },
      },
    },
    data: { items: [{ code: 'x' }] },
    expectFailure: { code: 'INVALID_FORM_INPUT', message: 'Repeated data must be a keyed object: items', at: '' },
  },
  {
    name: 'visibility-hidden-field-skips-all-rules',
    note: 'A field whose design.show resolves to false is hidden: none of its rules run (required, pattern, lengths, the implicit number check, email, mincount) and it reports no error. Its value is kept.',
    spec: { type: 'group', properties: { enabled: { type: 'checkbox' }, ...failingFields('.enabled') } },
    data: { enabled: 0, ...failingValues },
    expected: result(),
  },
  {
    name: 'visibility-shown-field-validates',
    note: 'The same fields with design.show resolving to true are visible, and each reports its first failing rule in declaration order.',
    spec: { type: 'group', properties: { enabled: { type: 'checkbox' }, ...failingFields('.enabled') } },
    data: { enabled: 1, ...failingValues },
    expected: result(
      error('name', 'required', ''),
      error('code', 'pattern', 'x!'),
      error('title', 'minlength', 'ab', 3),
      error('amount', 'number', 'abc'),
      error('contact', 'email', 'not-an-address'),
      error('tags', 'mincount', { __t1__: 'one' }, 2),
    ),
  },
  {
    name: 'visibility-literal-show',
    note: 'design.show: false hides a field whatever the data; design.show: true and a field without design.show are visible.',
    spec: {
      type: 'group',
      properties: {
        hidden: { type: 'text', design: { show: false }, validate: { required: true } },
        shown: { type: 'text', design: { show: true }, validate: { required: true } },
        plain: { type: 'text', validate: { required: true } },
      },
    },
    data: { hidden: '', shown: '', plain: '' },
    expected: result(error('shown', 'required', ''), error('plain', 'required', '')),
  },
  {
    name: 'visibility-condition-map',
    note: 'A condition map resolves design.show to its first matching value or its true default: the first two maps select false and hide their fields, the third selects true.',
    spec: {
      type: 'group',
      properties: {
        mode: { type: 'text' },
        defaulted: { type: 'text', design: { show: { ".mode == 'on'": true, true: false } }, validate: { required: true } },
        matched: { type: 'text', design: { show: { ".mode == 'off'": false, true: true } }, validate: { required: true } },
        visible: { type: 'text', design: { show: { ".mode == 'on'": false, true: true } }, validate: { required: true } },
      },
    },
    data: { mode: 'off', defaulted: '', matched: '', visible: '' },
    expected: result(error('visible', 'required', '')),
  },
  {
    name: 'visibility-hidden-group-descendants',
    note: 'Every field inside a hidden group is skipped, including a nested group, a nested repeated group with mincount, the rows of that collection and a child whose own design.show is true. A hidden top-level collection skips its count rule.',
    spec: {
      type: 'group',
      properties: {
        enabled: { type: 'checkbox' },
        details: {
          type: 'group',
          design: { show: '.enabled' },
          properties: {
            name: { type: 'text', validate: { required: true } },
            always: { type: 'text', design: { show: true }, validate: { required: true } },
            inner: {
              type: 'group',
              properties: { code: { type: 'text', validate: { pattern: '^[0-9]+$' } } },
            },
            items: {
              type: 'group',
              multiple: true,
              validate: { mincount: 2 },
              properties: { code: { type: 'text', validate: { required: true } } },
            },
          },
        },
        rows: {
          type: 'group',
          multiple: true,
          design: { show: false },
          validate: { mincount: 3 },
          properties: { label: { type: 'text', validate: { required: true } } },
        },
      },
    },
    data: {
      enabled: '',
      details: { name: '', always: '', inner: { code: 'abc' }, items: { __i1__: { code: '' } } },
      rows: { __r1__: { label: '' } },
    },
    expected: result(),
  },
  {
    name: 'visibility-per-row',
    note: "design.show resolves in the row context: '.kind' reads the sibling in the same row, so only the row whose kind is custom validates its note.",
    spec: {
      type: 'group',
      properties: {
        items: {
          type: 'group',
          multiple: true,
          properties: {
            kind: { type: 'text' },
            note: { type: 'text', design: { show: ".kind == 'custom'" }, validate: { required: true, minlength: 2 } },
          },
        },
      },
    },
    data: {
      items: {
        __b__: { kind: 'custom', note: 'x' },
        __a__: { kind: 'plain', note: '' },
        __c__: { kind: 'custom', note: '' },
      },
    },
    expected: result(
      error('items.__b__.note', 'minlength', 'x', 2),
      error('items.__c__.note', 'required', ''),
    ),
  },
  {
    name: 'visibility-hidden-value-still-read',
    note: 'A hidden field reports nothing, but equalTo and a required condition elsewhere read its kept value.',
    spec: {
      type: 'group',
      properties: {
        secret: { type: 'text', design: { show: false }, validate: { minlength: 10 } },
        confirm: { type: 'text', validate: { equalTo: '.secret' } },
        reason: { type: 'text', validate: { required: ".secret == 'open'" } },
      },
    },
    data: { secret: 'open', confirm: 'other', reason: '' },
    expected: result(error('confirm', 'equalTo', 'other'), error('reason', 'required', '')),
  },
  {
    name: 'visibility-toggle-step-1-shown-valid',
    note: 'Step 1 of 3: the flag is 1, the group is shown and its values are valid.',
    spec: toggleSpec,
    data: { is_display: '1', display: { code: 'ABC', title: 'Hello' } },
    expected: result(),
  },
  {
    name: 'visibility-toggle-step-2-hidden-invalid',
    note: 'Step 2 of 3: the flag is 0, the group is hidden, and a pattern-violating code and a missing required title report nothing.',
    spec: toggleSpec,
    data: { is_display: '0', display: invalidDisplay },
    expected: result(),
  },
  {
    name: 'visibility-toggle-step-3-shown-invalid',
    note: 'Step 3 of 3: the flag is 1 again, and the values kept while the group was hidden are validated.',
    spec: toggleSpec,
    data: { is_display: '1', display: invalidDisplay },
    expected: result(error('display.code', 'pattern', 'abc1'), error('display.title', 'required', '')),
  },
  {
    name: 'multiple-only-rows-validated',
    note: 'multiple: only takes its rows from the data keys; each row is validated, and errors follow sorted key order.',
    spec: onlyRows('only'),
    data: { variants: { __opt_b2__: { name: '', price: 5 }, __opt_a1__: { name: 'Red', price: -1 } } },
    expected: result(
      error('variants.__opt_a1__.price', 'min', -1, 0),
      error('variants.__opt_b2__.name', 'required', ''),
    ),
  },
  {
    name: 'multiple-only-missing-data-valid',
    note: 'Missing data of a multiple: only collection has no row, so its row rules do not run.',
    spec: onlyRows('only'),
    data: {},
    expected: result(),
  },
  {
    name: 'multiple-only-missing-data-required',
    note: 'A required multiple.only collection without data fails required with the missing value.',
    spec: onlyRows({ only: true, title: 'name' }, { required: true }),
    data: {},
    expected: result(error('variants', 'required', null)),
  },
  {
    name: 'multiple-only-missing-data-mincount',
    note: 'Collection counts evaluate empty collections, and missing data is an empty value: a multiple: only collection without data fails mincount with the missing value.',
    spec: onlyRows('only', { mincount: 1 }),
    data: {},
    expected: result(error('variants', 'mincount', null, 1)),
  },
  {
    name: 'multiple-missing-data-required',
    note: 'Missing data of any repeated group is an empty collection: required fails with the missing value.',
    spec: onlyRows(true, { required: true }),
    data: {},
    expected: result(error('variants', 'required', null)),
  },
  {
    name: 'multiple-missing-data-mincount',
    note: 'Missing data of any repeated group is an empty collection: mincount counts 0.',
    spec: onlyRows(true, { mincount: 1 }),
    data: {},
    expected: result(error('variants', 'mincount', null, 1)),
  },
  {
    name: 'multiple-only-empty-required',
    note: 'A required multiple: only collection with {} has zero rows and fails required with the empty object.',
    spec: onlyRows('only', { required: true }),
    data: { variants: {} },
    expected: result(error('variants', 'required', {})),
  },
];
