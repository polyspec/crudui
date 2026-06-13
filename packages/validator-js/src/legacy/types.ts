import type { RulesSpec, MessagesSpec } from '../types';
export * from '../types';

/**
 * Root spec structure for form definition
 */
export interface Spec {
  /** Discriminator marking the root as a group container; always `'group'`. */
  type: 'group';
  /** Unique key for the form (used as prefix for field names, e.g., "product") */
  key?: string;
  /** Machine-readable name of the form, used when generating field name prefixes. */
  name?: string;
  /** Human-readable label rendered for the form as a whole. */
  label?: string;
  /** Display title shown at the top of the rendered form. */
  title?: string;
  /** Longer descriptive text explaining the purpose of the form. */
  description?: string;
  /** Map of field name to its specification; defines the form's fields. */
  properties: Record<string, FieldSpec>;
  /** Submission behavior (HTTP method, target URL, buttons) for the form. */
  action?: ActionSpec;
}

/**
 * Field specification
 */
export interface FieldSpec {
  /** Field type identifier (e.g., `text`, `email`, `group`, `select`) selecting the renderer and default behavior. */
  type: string;
  /** Human-readable label rendered next to the field. */
  label?: string;
  /** Help text describing the field, shown alongside the input. */
  description?: string;
  /** Placeholder text shown inside the empty input. */
  placeholder?: string;
  /** Default value applied when the field has no submitted value. */
  default?: unknown;
  /** When true, the field is rendered read-only and cannot be edited. */
  readonly?: boolean;
  /** When true, the field is disabled and excluded from submission. */
  disabled?: boolean;
  /** Whether the field accepts multiple values; `'only'` forces multi-value mode. */
  multiple?: boolean | 'only';
  /** Validation rules applied to the field's value. */
  rules?: RulesSpec;
  /** Custom error messages overriding the default per-rule messages. */
  messages?: MessagesSpec;
  /** Nested child fields when this field is a group/container. */
  properties?: Record<string, FieldSpec>;
  /** Selectable options: a static value-to-label map or a dynamic source descriptor. */
  items?: Record<string, string> | ItemsSourceSpec;
  /**
   * Condition expression controlling field visibility.
   * Boolean values are also accepted: false = always hidden (validation
   * skipped), true = always visible.
   */
  display_switch?: string | boolean;
  /** Selector/name of another field whose visibility is toggled by this field's `display_switch`. */
  display_target?: string;
  /** Index signature allowing arbitrary additional spec keys not modeled explicitly. */
  [key: string]: unknown;
}

/**
 * Action spec for form submission
 */
export interface ActionSpec {
  /** HTTP method used to submit the form (e.g., `GET`, `POST`). */
  method?: string;
  /** Target URL the form is submitted to. */
  url?: string;
  /** Form encoding type (e.g., `application/x-www-form-urlencoded`, `multipart/form-data`). */
  enctype?: string;
  /** Map of button name to its specification, rendered in the form's action area. */
  buttons?: Record<string, ButtonSpec>;
}

/**
 * Button specification
 */
export interface ButtonSpec {
  /** Text displayed on the button. */
  label?: string;
  /** CSS class names applied to the button element. */
  class?: string;
  /** Button type attribute (e.g., `submit`, `button`, `reset`). */
  type?: string;
  /** Hyperlink target; when set the button behaves as a link. */
  href?: string;
  /** Inline JavaScript handler invoked on click. */
  onclick?: string;
}

/**
 * Dynamic items source specification
 */
export interface ItemsSourceSpec {
  /** Data model/source name the option list is loaded from. */
  model?: string;
  /** Method on the model invoked to fetch the option rows. */
  method?: string;
  /** Name of the row field used as each option's value. */
  value_field?: string;
  /** Name of the row field used as each option's display label. */
  label_field?: string;
  /** Label for a leading empty/placeholder option; when set, a blank choice is prepended. */
  empty_option?: string;
}

/**
 * Options for Validator instance
 */
export interface ValidatorOptions {
  /**
   * Enable debug mode for verbose error logging
   * When enabled, condition parsing/evaluation errors will be logged to console.warn
   */
  debug?: boolean;
}
