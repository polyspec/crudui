import type { RulesSpec, MessagesSpec } from '../types';
export * from '../types';

/**
 * Root spec structure for form definition
 */
export interface Spec {
  type: 'group';
  name?: string;
  label?: string;
  title?: string;
  description?: string;
  properties: Record<string, FieldSpec>;
  action?: ActionSpec;
}

/**
 * Field specification
 */
export interface FieldSpec {
  type: string;
  label?: string;
  description?: string;
  placeholder?: string;
  default?: unknown;
  readonly?: boolean;
  disabled?: boolean;
  multiple?: boolean | 'only';
  rules?: RulesSpec;
  messages?: MessagesSpec;
  properties?: Record<string, FieldSpec>;
  items?: Record<string, string> | ItemsSourceSpec;
  display_switch?: string;
  display_target?: string;
  [key: string]: unknown;
}

/**
 * Action spec for form submission
 */
export interface ActionSpec {
  method?: string;
  url?: string;
  enctype?: string;
  buttons?: Record<string, ButtonSpec>;
}

/**
 * Button specification
 */
export interface ButtonSpec {
  label?: string;
  class?: string;
  type?: string;
  href?: string;
  onclick?: string;
}

/**
 * Dynamic items source specification
 */
export interface ItemsSourceSpec {
  model?: string;
  method?: string;
  value_field?: string;
  label_field?: string;
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
