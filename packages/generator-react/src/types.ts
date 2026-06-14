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
} from '@polyspec/validator';

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
  spec: string | import('@polyspec/validator').Spec;
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
  /** Field type that selects the component (e.g. `text`, `select`, `group`) */
  type: string;
  /** Visible field label (plain or per-language map) */
  label?: string | MultiLangText;
  /** Help text shown below the field (plain or per-language map) */
  description?: string | MultiLangText;
  /** Input placeholder text (plain or per-language map) */
  placeholder?: string | MultiLangText;
  /** Initial value applied when the field has no data */
  default?: unknown;
  /** Render the field read-only */
  readonly?: boolean;
  /** Render the field disabled */
  disabled?: boolean;
  /** Repeat the field as an array; `'only'` allows multiple without an add button */
  multiple?: boolean | 'only';

  // Validation
  /** Validation rules applied to the field value */
  rules?: import('@polyspec/validator').RulesSpec;
  /** Custom validation messages keyed by rule name */
  messages?: import('@polyspec/validator').MessagesSpec;

  // Conditional display (boolean = unconditional on/off, string = condition expression)
  /** Show/hide condition: boolean toggles unconditionally, string is a condition expression */
  display_switch?: string | boolean;
  /** Name of the field this field's visibility is driven by */
  display_target?: string;
  /** Conditional display configuration (`all_of` / `any_of` rules) */
  element?: ElementConfig;

  // Items for select/radio/checkbox lists. The ordered pair form
  // ([[key, label], ...]) preserves entry order that plain JS objects
  // destroy for integer-like keys (legacy YAML maps are ordered; see
  // limepieParity itemEntries).
  /**
   * Options for select/radio/checkbox lists. The ordered pair form
   * (`[[key, label], ...]`) preserves entry order that plain JS objects
   * destroy for integer-like keys (legacy YAML maps are ordered; see
   * limepieParity `itemEntries`).
   */
  items?:
    | Record<string, string>
    | Array<[string | number, unknown]>
    | import('@polyspec/validator').ItemsSourceSpec;

  // CSS classes
  /** Extra CSS classes applied to the input element */
  input_class?: string;
  /** Extra CSS classes applied to the field wrapper */
  wrapper_class?: string;
  /** Extra CSS classes applied to the label */
  label_class?: string;
  /** Generic extra CSS classes (Limepie `class` attribute) */
  class?: string;

  // HTML content
  /** Raw HTML rendered before the input (input-group prepend) */
  prepend?: string;
  /** Raw HTML rendered after the input (input-group append) */
  append?: string;

  // Input attributes
  /** Auto-focus the input on mount */
  autofocus?: boolean;
  /** HTML `autocomplete` attribute value */
  autocomplete?: string;
  /** HTML `maxlength` attribute value */
  maxlength?: number;

  // Button specific
  /** Label for a single action button */
  button_label?: string | MultiLangText;
  /** Label for the "add row" button of a multiple field */
  add_button_label?: string | MultiLangText;
  /** Label for the "remove row" button of a multiple field */
  remove_button_label?: string | MultiLangText;
  /** Inline label rendered beside a checkbox */
  checkbox_label?: string | MultiLangText;
  /** Visual variant token for buttons (e.g. `primary`, `secondary`) */
  variant?: string;
  /** Size token for buttons/inputs (e.g. `sm`, `lg`) */
  size?: string;
  /** Icon identifier rendered with the field/button */
  icon?: string;
  /** Whether the icon renders before or after the label */
  icon_position?: 'before' | 'after';
  /** Action identifier for action-type fields */
  action?: string;
  /** Arbitrary payload attached to the field/action */
  data?: unknown;

  // Multiple/sortable
  /** Allow drag-reordering of multiple rows */
  sortable?: boolean;
  /** Minimum number of multiple rows / minimum numeric value */
  min?: number;
  /** Maximum number of multiple rows / maximum numeric value */
  max?: number;
  /** Step increment for numeric inputs */
  step?: number;

  // Geometry specific
  /** Geometry shape for map/geometry fields (e.g. `point`, `polygon`) */
  geometry_type?: string;

  // Helper text
  /** Short helper text shown near the input (plain or per-language map) */
  helper?: string | MultiLangText;

  // Nested properties for groups
  /** Child field specs for group/object fields, keyed by field name */
  properties?: Record<string, ReactFieldSpec>;

  // Index signature for additional properties used by specific field components
  // These are typed as unknown but cast to their proper types in each component
  /** Additional spec properties consumed by specific field components, cast per-component */
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
  /**
   * Multiple-row buttons injected at the legacy `<!--btn-->` slot — the LAST
   * child of the field's .input-group (after append). Only set for
   * multiple: true leaf rows. Field components MUST render it there;
   * rendering it outside .input-group breaks reference parity.
   */
  buttons?: ReactNode;
  /**
   * Raw legacy HTML for the SAME `<!--btn-->` slot (Fields::addElement
   * port), set alongside `buttons` for multiple leaf rows. A field's
   * legacy-raw branch (spec-authored inline onchange / dynamic_onchange)
   * MUST render this string INSTEAD of `buttons` — React cannot emit string
   * on* attributes. Never render both.
   */
  buttonsHtml?: string;
  /** Delegated click handler for buttonsHtml rows (add/remove/move). */
  onButtonsClick?: React.MouseEventHandler<HTMLElement>;
}

/**
 * Wrapper render props
 */
export interface WrapperRenderProps {
  /** Rendered form fields to place inside the custom wrapper */
  children: ReactNode;
  /** Full form specification being rendered */
  spec: import('@polyspec/validator').Spec;
  /** Submit handler to wire onto the wrapping `<form>` element */
  onSubmit: (e: React.FormEvent) => void;
}

/**
 * Buttons render props
 */
export interface ButtonsRenderProps {
  /** Full form specification being rendered */
  spec: import('@polyspec/validator').Spec;
  /** Whether a submit is currently in flight */
  isSubmitting: boolean;
  /** Whether the form currently passes validation */
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
  spec: import('@polyspec/validator').Spec;
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
  /** Key prefix for field names (e.g., "product") */
  keyPrefix: string;
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
  /** Field-name → expected value(s); all entries must match for the condition to hold */
  conditions: Record<string, FormValue | FormValue[]>;
  /** Inline style applied while all conditions are met */
  inline?: string;
  /** CSS class applied while all conditions are met */
  class?: string;
  /** Style/class applied while the conditions are NOT met */
  not?: {
    /** Inline style applied while the conditions are not met */
    inline?: string;
    /** CSS class applied while the conditions are not met */
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
  /** Name of the field whose value drives this field's display */
  target: string;
  /** Target value → inline style to apply */
  conditionStyle?: Record<string, string>;
  /** Target value → CSS class to apply */
  conditionClass?: Record<string, string>;
}

/**
 * Element configuration
 */
export interface ElementConfig {
  /** Condition requiring every entry to match (with style/class effects) */
  all_of?: AllOfCondition;
  /** Conditions where any single match triggers its effect */
  any_of?: AnyOfCondition[];
}

/**
 * Any-of condition
 */
export interface AnyOfCondition {
  /** Condition expression evaluated against form data */
  condition: string;
  /** Effect applied when the condition matches (e.g. show/hide) */
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
  /** React component that renders this field type */
  component: React.ComponentType<FieldComponentProps>;
  /** Canonical field-type name the component is registered under */
  name: string;
  /** Additional field-type names that resolve to the same component */
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
