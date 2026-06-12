/**
 * Form-spec Vue Types (trimmed port of the React type surface).
 */

import type { Spec } from '@form-spec/validator';

export type { Spec } from '@form-spec/validator';

export type Language = 'ko' | 'en' | 'ja' | 'zh';
export type MultiLangText = string | Record<string, string>;

export type FormPrimitiveValue = string | number | boolean | null | undefined;

export interface FormData {
  [key: string]: unknown;
}

export type FormValue = unknown;
export type FormErrors = Record<string, string>;

/**
 * React-extended FieldSpec interface — loose index signature so each field
 * component reads its own keys.
 */
export interface ReactFieldSpec {
  type: string;
  label?: string | MultiLangText;
  description?: string | MultiLangText;
  placeholder?: string | MultiLangText;
  default?: unknown;
  readonly?: boolean;
  disabled?: boolean;
  multiple?: boolean | string;
  rules?: Record<string, unknown>;
  display_switch?: string | boolean | Record<string, unknown>;
  display_target?: string;
  element?: { all_of?: AllOfCondition };
  items?:
    | Record<string, string>
    | Array<[string | number, unknown]>
    | Record<string, unknown>;
  input_class?: string;
  wrapper_class?: string;
  label_class?: string;
  class?: string;
  prepend?: string;
  append?: string;
  autofocus?: boolean;
  autocomplete?: string;
  maxlength?: number;
  sortable?: boolean;
  min?: number;
  max?: number;
  step?: number;
  properties?: Record<string, ReactFieldSpec>;
  [key: string]: unknown;
}

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
  name: string;
  spec: ReactFieldSpec;
  value: FormValue;
  error?: string;
  disabled?: boolean;
  readonly?: boolean;
  language: string;
  path: string;
  parentPath?: string;
  index?: number;
  uniqueKey?: string;
  buttons?: unknown;
  buttonsHtml?: string;
}

export interface FormBuilderProps {
  spec: string | Spec;
  data?: FormData;
  language?: Language;
  className?: string;
  disabled?: boolean;
  readonly?: boolean;
}

/**
 * The plain (non-reactive) render context threaded through provide/inject —
 * golden fixtures are empty-data static renders, so no live form state.
 */
export interface RenderContext {
  spec: Spec;
  data: FormData;
  errors: FormErrors;
  getValue: (path: string) => FormValue;
  isFieldVisible: (path: string) => boolean;
  disabled: boolean;
  readonly: boolean;
  keyPrefix: string;
  language: string;
  t: (text: MultiLangText | undefined, fallback?: string) => string;
}
