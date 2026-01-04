/**
 * Form-spec React Types
 */

import type { ReactNode, ChangeEvent, FocusEvent } from 'react';

// ============================================================================
// Re-export validator types
// ============================================================================
export type {
  Spec,
  FieldSpec as BaseFieldSpec,
  ActionSpec,
  ButtonSpec,
  ItemsSourceSpec,
  RulesSpec,
  MessagesSpec,
  ValidationResult,
  ValidationError,
} from '@legacy/form-validator/legacy';

// ============================================================================
// Language Types
// ============================================================================

/**
 * Supported languages
 */
export type Language = 'ko' | 'en' | 'ja' | 'zh';

/**
 * Multi-language label/message structure
 */
export type MultiLangText = string | Record<Language, string>;

// ============================================================================
// Form Data Types
// ============================================================================

/**
 * Form data values (primitive types)
 */
export type FormPrimitiveValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | File
  | FileList;

/**
 * Form data structure
 */
export interface FormData {
  [key: string]: FormPrimitiveValue | FormPrimitiveValue[] | FormData | FormData[];
}

/**
 * Form data values (includes nested structures)
 */
export type FormValue = FormPrimitiveValue | FormPrimitiveValue[] | FormData | FormData[];

/**
 * Form errors structure
 */
export type FormErrors = Record<string, string>;

// ============================================================================
// Component Props Types
// ============================================================================

/**
 * FormBuilder component props
 */
export interface FormBuilderProps {
  /** Form specification (YAML string or parsed object) */
  spec: string | import('@legacy/form-validator/legacy').Spec;
  /** Initial form data */
  data?: FormData;
  /** Current language */
  language?: Language;
  /** Form submit handler */
  onSubmit?: (data: FormData, errors: FormErrors) => void;
  /** Field change handler */
  onChange?: (name: string, value: FormValue, data: FormData) => void;
  /** Form validation handler */
  onValidate?: (errors: FormErrors) => void;
  /** Custom CSS class */
  className?: string;
  /** Disable all fields */
  disabled?: boolean;
  /** Read-only mode */
  readonly?: boolean;
  /** Custom field components */
  customFields?: Record<string, React.ComponentType<FieldComponentProps>>;
  /** Custom render for wrapper */
  renderWrapper?: (props: WrapperRenderProps) => ReactNode;
  /** Custom render for buttons */
  renderButtons?: (props: ButtonsRenderProps) => ReactNode;
}

/**
 * React-extended FieldSpec interface
 * Includes index signature for flexibility with additional unknown properties
 */
export interface ReactFieldSpec {
  // Core field properties
  type: string;
  label?: string | MultiLangText;
  description?: string | MultiLangText;
  placeholder?: string | MultiLangText;
  default?: unknown;
  readonly?: boolean;
  disabled?: boolean;
  multiple?: boolean | 'only';

  // Validation
  rules?: import('@legacy/form-validator/legacy').RulesSpec;
  messages?: import('@legacy/form-validator/legacy').MessagesSpec;

  // Conditional display
  display_switch?: string;
  display_target?: string;
  element?: ElementConfig;

  // Items for select/radio/checkbox lists
  items?: Record<string, string> | import('@legacy/form-validator/legacy').ItemsSourceSpec;

  // CSS classes
  input_class?: string;
  wrapper_class?: string;
  label_class?: string;
  class?: string;

  // HTML content
  prepend?: string;
  append?: string;

  // Input attributes
  autofocus?: boolean;
  autocomplete?: string;
  maxlength?: number;

  // Button specific
  button_label?: string | MultiLangText;
  add_button_label?: string | MultiLangText;
  remove_button_label?: string | MultiLangText;
  checkbox_label?: string | MultiLangText;
  variant?: string;
  size?: string;
  icon?: string;
  icon_position?: 'before' | 'after';
  action?: string;
  data?: unknown;

  // Multiple/sortable
  sortable?: boolean;
  min?: number;
  max?: number;
  step?: number;

  // Geometry specific
  geometry_type?: string;

  // Helper text
  helper?: string | MultiLangText;

  // Nested properties for groups
  properties?: Record<string, ReactFieldSpec>;

  // Index signature for additional properties used by specific field components
  // These are typed as unknown but cast to their proper types in each component
  [key: string]: unknown;
}

/**
 * Field component props
 */
export interface FieldComponentProps {
  /** Field name */
  name: string;
  /** Field specification (extended with React-specific properties) */
  spec: ReactFieldSpec;
  /** Current value */
  value: FormValue;
  /** Change handler */
  onChange: (value: FormValue) => void;
  /** Blur handler */
  onBlur: () => void;
  /** Error message */
  error?: string;
  /** Is field disabled */
  disabled?: boolean;
  /** Is field readonly */
  readonly?: boolean;
  /** Current language */
  language: Language;
  /** Path in form data */
  path: string;
  /** Parent context for nested groups */
  parentPath?: string;
  /** Index in array (for multiple fields) */
  index?: number;
  /** Unique key for array items */
  uniqueKey?: string;
}

/**
 * Wrapper render props
 */
export interface WrapperRenderProps {
  children: ReactNode;
  spec: import('@legacy/form-validator/legacy').Spec;
  onSubmit: (e: React.FormEvent) => void;
}

/**
 * Buttons render props
 */
export interface ButtonsRenderProps {
  spec: import('@legacy/form-validator/legacy').Spec;
  isSubmitting: boolean;
  isValid: boolean;
}

// ============================================================================
// Form Context Types
// ============================================================================

/**
 * Form context value
 */
export interface FormContextValue {
  /** Full form specification */
  spec: import('@legacy/form-validator/legacy').Spec;
  /** Current form data */
  data: FormData;
  /** Current errors */
  errors: FormErrors;
  /** Update field value */
  setValue: (path: string, value: FormValue) => void;
  /** Get field value */
  getValue: (path: string) => FormValue;
  /** Set error for field */
  setError: (path: string, error: string) => void;
  /** Clear error for field */
  clearError: (path: string) => void;
  /** Validate single field */
  validateField: (path: string) => string | null;
  /** Validate entire form */
  validateForm: () => FormErrors;
  /** Check if field is visible (conditional) */
  isFieldVisible: (path: string) => boolean;
  /** Register field */
  registerField: (path: string) => void;
  /** Unregister field */
  unregisterField: (path: string) => void;
  /** Global disabled state */
  disabled: boolean;
  /** Global readonly state */
  readonly: boolean;
  /** Custom field components */
  customFields: Record<string, React.ComponentType<FieldComponentProps>>;
}

/**
 * I18n context value
 */
export interface I18nContextValue {
  /** Current language */
  language: Language;
  /** Set language */
  setLanguage: (lang: Language) => void;
  /** Get translated text */
  t: (text: MultiLangText, fallback?: string) => string;
}

// ============================================================================
// Hook Types
// ============================================================================

/**
 * useForm hook return type
 */
export interface UseFormReturn {
  /** Current form data */
  data: FormData;
  /** Current errors */
  errors: FormErrors;
  /** Is form valid */
  isValid: boolean;
  /** Is form dirty (has changes) */
  isDirty: boolean;
  /** Is form submitting */
  isSubmitting: boolean;
  /** Set field value */
  setValue: (path: string, value: FormValue) => void;
  /** Get field value */
  getValue: (path: string) => FormValue;
  /** Set multiple values */
  setValues: (values: FormData) => void;
  /** Reset form to initial data */
  reset: (data?: FormData) => void;
  /** Validate field */
  validateField: (path: string) => string | null;
  /** Validate entire form */
  validate: () => FormErrors;
  /** Submit form */
  submit: () => Promise<void>;
  /** Handle input change event */
  handleChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  /** Handle input blur event */
  handleBlur: (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
}

/**
 * useValidation hook return type
 */
export interface UseValidationReturn {
  /** Validate single field */
  validateField: (path: string, value: FormValue) => string | null;
  /** Validate multiple fields */
  validateFields: (fields: Record<string, FormValue>) => FormErrors;
  /** Validate entire form data */
  validateForm: (data: FormData) => FormErrors;
  /** Check if value is valid for a rule */
  checkRule: (ruleName: string, value: FormValue, param: unknown) => boolean;
}

/**
 * useConditional hook return type
 */
export interface UseConditionalReturn {
  /** Check if field should be visible */
  isVisible: (path: string) => boolean;
  /** Check display_switch condition */
  evaluateDisplaySwitch: (condition: string, context: ConditionalContext) => boolean;
  /** Check display_target condition */
  evaluateDisplayTarget: (targetField: string, currentValue: FormValue) => boolean;
  /** Check element.all_of conditions */
  evaluateAllOf: (conditions: AllOfCondition) => AllOfResult;
}

/**
 * Conditional context
 */
export interface ConditionalContext {
  /** Current field path */
  path: string;
  /** Current form data */
  data: FormData;
}

/**
 * All-of condition structure
 */
export interface AllOfCondition {
  conditions: Record<string, FormValue | FormValue[]>;
  inline?: string;
  class?: string;
  not?: {
    inline?: string;
    class?: string;
  };
}

/**
 * All-of evaluation result
 */
export interface AllOfResult {
  /** Whether all conditions are met */
  met: boolean;
  /** Style to apply */
  style?: string;
  /** Class to apply */
  className?: string;
}

/**
 * useMultiple hook return type
 */
export interface UseMultipleReturn<T = FormValue> {
  /** Array items with unique keys */
  items: MultipleItem<T>[];
  /** Add new item at specific index (or at end if no index provided) */
  add: (indexOrValue?: number | T, value?: T) => void;
  /** Remove item by key */
  remove: (key: string) => void;
  /** Move item to new index */
  move: (fromIndex: number, toIndex: number) => void;
  /** Swap two items */
  swap: (indexA: number, indexB: number) => void;
  /** Update item value */
  update: (key: string, value: T) => void;
  /** Clear all items */
  clear: () => void;
  /** Reset to initial items */
  reset: (items?: T[]) => void;
  /** Get item by key */
  getItem: (key: string) => MultipleItem<T> | undefined;
  /** Current length */
  length: number;
  /** Can add more items (based on max) */
  canAdd: boolean;
  /** Can remove items (based on min) */
  canRemove: boolean;
}

/**
 * Multiple item with unique key
 */
export interface MultipleItem<T = FormValue> {
  /** Unique key (__13chars__) */
  key: string;
  /** Item value */
  value: T;
  /** Item order index */
  order: number;
}

// ============================================================================
// Display Condition Types
// ============================================================================

/**
 * Display switch configuration
 */
export interface DisplaySwitchConfig {
  [value: string]: string[];
}

/**
 * Display target configuration
 */
export interface DisplayTargetConfig {
  target: string;
  conditionStyle?: Record<string, string>;
  conditionClass?: Record<string, string>;
}

/**
 * Element configuration
 */
export interface ElementConfig {
  all_of?: AllOfCondition;
  any_of?: AnyOfCondition[];
}

/**
 * Any-of condition
 */
export interface AnyOfCondition {
  condition: string;
  effect?: string;
}

// ============================================================================
// Extended FieldSpec for React
// ============================================================================

/**
 * FieldSpec is an alias for ReactFieldSpec for backward compatibility
 * Both types are identical and can be used interchangeably
 */
export type FieldSpec = ReactFieldSpec;

// ============================================================================
// Field Registry Types
// ============================================================================

/**
 * Field registry entry
 */
export interface FieldRegistryEntry {
  component: React.ComponentType<FieldComponentProps>;
  name: string;
  aliases?: string[];
}

/**
 * Field type to component mapping
 */
export type FieldRegistry = Map<string, React.ComponentType<FieldComponentProps>>;

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Deep partial type
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Path segments array
 */
export type PathSegments = (string | number)[];

/**
 * Unique key pattern
 */
export type UniqueKey = `__${string}__`;

/**
 * Generate unique key function type
 */
export type GenerateKeyFn = () => UniqueKey;
