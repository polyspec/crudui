/**
 * CRUDUI Vue Types (trimmed port of the React type surface).
 */

import type { Spec } from '@crudui/validator/legacy';

export type { Spec } from '@crudui/validator/legacy';

/** Supported UI language codes used for label/message resolution. */
export type Language = 'ko' | 'en' | 'ja' | 'zh';
/** A localizable string: either a plain string or a language-code → text map. */
export type MultiLangText = string | Record<string, string>;

/** Scalar value a leaf field can hold before bracket-name serialization. */
export type FormPrimitiveValue = string | number | boolean | null | undefined;

/** Form data bag keyed by field name; values are untyped (any spec shape). */
export interface FormData {
  [key: string]: unknown;
}

/** A single field value, of unknown shape (scalar, array, or nested object). */
export type FormValue = unknown;
/** Validation errors keyed by field path → message string. */
export type FormErrors = Record<string, string>;

/**
 * React-extended FieldSpec interface — loose index signature so each field
 * component reads its own keys.
 */
export interface ReactFieldSpec {
  /** Field type discriminator that selects the renderer (e.g. `text`, `select`, `group`). */
  type: string;
  /** Field label (heading text), localizable. */
  label?: string | MultiLangText;
  /** Field description / help text shown under the label, localizable. */
  description?: string | MultiLangText;
  /** Input placeholder text, localizable. */
  placeholder?: string | MultiLangText;
  /** Default value applied when the bound data has no value for this field. */
  default?: unknown;
  /** When true, the field renders read-only. */
  readonly?: boolean;
  /** When true, the field renders disabled. */
  disabled?: boolean;
  /** Repeating-field marker (`true`/`'true'`/`'only'`) that enables multiple rows. */
  multiple?: boolean | string;
  /** Validation rule map (e.g. `maxlength`, `accept`) passed through to the legacy validator. */
  rules?: Record<string, unknown>;
  /** Conditional-visibility expression evaluated against form data. */
  display_switch?: string | boolean | Record<string, unknown>;
  /** Sibling field path whose value controls this field's visibility. */
  display_target?: string;
  /** Legacy `element.all_of` conditional style/class block. */
  element?: {
    /** All-of condition set whose match toggles inline style / class. */
    all_of?: AllOfCondition;
  };
  /** Option source for select/choice/multichoice/search fields. */
  items?:
    | Record<string, string>
    | Array<[string | number, unknown]>
    | Record<string, unknown>;
  /** Extra CSS class for the inner input element. */
  input_class?: string;
  /** Extra CSS class for the input-group wrapper. */
  wrapper_class?: string;
  /** Extra CSS class for the label heading. */
  label_class?: string;
  /** Generic CSS class slot. */
  class?: string;
  /** Input-group prepend addon (raw HTML/text). */
  prepend?: string;
  /** Input-group append addon (raw HTML/text). */
  append?: string;
  /** Autofocus the input on render. */
  autofocus?: boolean;
  /** HTML `autocomplete` attribute value. */
  autocomplete?: string;
  /** HTML `maxlength` attribute value. */
  maxlength?: number;
  /** Enable move-up/move-down reordering buttons for multiple rows. */
  sortable?: boolean;
  /** Minimum value (number/time inputs). */
  min?: number;
  /** Maximum value (number/time inputs). */
  max?: number;
  /** Step increment (number/time inputs). */
  step?: number;
  /** Child field specs for `group` type fields, keyed by field name. */
  properties?: Record<string, ReactFieldSpec>;
  /** Loose index signature — each field renderer reads its own extra keys. */
  [key: string]: unknown;
}

/** Alias for {@link ReactFieldSpec}; the public name of a single field spec. */
export type FieldSpec = ReactFieldSpec;

export interface AllOfCondition {
  conditions: Record<string, FormValue | FormValue[]>;
  inline?: string;
  class?: string;
  not?: { inline?: string; class?: string };
}

export interface AllOfResult {
  met: boolean;
  style?: string;
  className?: string;
}

/**
 * Field component props (the data each leaf renderer consumes). `buttons`
 * (VNode) and `buttonsHtml`/`onButtonsClick` mirror the legacy `<!--btn-->`
 * slot for multiple leaf rows.
 */
export interface FieldComponentProps {
  /** Field name (last path segment) used in the element `name` attribute. */
  name: string;
  /** The field spec this renderer consumes. */
  spec: ReactFieldSpec;
  /** Current bound value for this field. */
  value: FormValue;
  /** Validation error message for this field, if any. */
  error?: string;
  /** Effective disabled state (context disabled OR spec disabled). */
  disabled?: boolean;
  /** Effective read-only state (context readonly OR spec readonly). */
  readonly?: boolean;
  /** Active language code for label/option resolution. */
  language: string;
  /** Dot-notation path of this field within the form tree. */
  path: string;
  /** Dot-notation path of the parent group, used for display-target resolution. */
  parentPath?: string;
  /** Row index when rendered inside a multiple (repeating) field. */
  index?: number;
  /** Per-row unique key (uniqid token) for a multiple-field row. */
  uniqueKey?: string;
  /** Pre-built row-button VNode for the normal (non-raw) render branch. */
  buttons?: unknown;
  /** Pre-built row-button HTML string for the legacy-raw render branch. */
  buttonsHtml?: string;
}

/** Props accepted by the {@link FormBuilder} top-level component. */
export interface FormBuilderProps {
  /** Form spec — a YAML string or an already-parsed, order-preserving object. */
  spec: string | Spec;
  /** Initial form data bound to the fields (reference renders use empty data). */
  data?: FormData;
  /** UI language for label/message resolution (defaults to `ko`). */
  language?: Language;
  /** Extra CSS class appended to the `form-builder` wrapper. */
  className?: string;
  /** Render every field disabled. */
  disabled?: boolean;
  /** Render every field read-only. */
  readonly?: boolean;
}

/**
 * The plain (non-reactive) render context threaded through provide/inject —
 * reference fixtures are empty-data static renders, so no live form state.
 */
export interface RenderContext {
  /** Render spec after legacy lang/display-switch transforms are applied. */
  spec: Spec;
  /** The bound form data (read-only during render). */
  data: FormData;
  /** Validation errors keyed by field path (empty for reference renders). */
  errors: FormErrors;
  /** Read a field value out of {@link RenderContext.data} by dot path. */
  getValue: (path: string) => FormValue;
  /** Evaluate display_switch / display_target visibility for a field path. */
  isFieldVisible: (path: string) => boolean;
  /** Whether every field renders disabled. */
  disabled: boolean;
  /** Whether every field renders read-only. */
  readonly: boolean;
  /** Form `key` prefix prepended to bracket-notation field names. */
  keyPrefix: string;
  /** Active language code. */
  language: string;
  /** Translate a localizable text (with optional fallback) to a plain string. */
  t: (text: MultiLangText | undefined, fallback?: string) => string;
}
