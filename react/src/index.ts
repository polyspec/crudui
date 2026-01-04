/**
 * @form-spec/generator-react
 *
 * React form builder component library based on form-spec YAML definitions
 *
 * @example
 * ```tsx
 * import { FormBuilder } from '@form-spec/generator-react';
 *
 * const yamlSpec = `
 * type: group
 * name: contact_form
 * properties:
 *   email:
 *     type: email
 *     label: Email
 *     rules:
 *       required: true
 *       email: true
 *   message:
 *     type: textarea
 *     label: Message
 *     rules:
 *       required: true
 * `;
 *
 * function App() {
 *   return (
 *     <FormBuilder
 *       spec={yamlSpec}
 *       data={{ email: '', message: '' }}
 *       language="ko"
 *       onSubmit={(data, errors) => {
 *         if (Object.keys(errors).length === 0) {
 *           console.log('Form submitted:', data);
 *         }
 *       }}
 *       onChange={(name, value) => {
 *         console.log(`Field ${name} changed:`, value);
 *       }}
 *     />
 *   );
 * }
 * ```
 */

// ============================================================================
// Main Component
// ============================================================================
export { FormBuilder } from './components/FormBuilder';
export { default as FormBuilderDefault } from './components/FormBuilder';

// ============================================================================
// Context Providers
// ============================================================================
export {
  FormContextProvider,
  useFormContext,
  FormContext,
} from './context/FormContext';

export {
  I18nContextProvider,
  useI18n,
  I18nContext,
  defaultMessages,
  formatMessage,
} from './context/I18nContext';

// ============================================================================
// Hooks
// ============================================================================
export { useForm, default as useFormDefault } from './hooks/useForm';
export { useValidation, default as useValidationDefault } from './hooks/useValidation';
export { useConditional, checkFieldVisibility, default as useConditionalDefault } from './hooks/useConditional';
export { useMultiple, multipleItemsToArray, arrayToMultipleItems, default as useMultipleDefault } from './hooks/useMultiple';

// ============================================================================
// Components
// ============================================================================
export { FormField } from './components/FormField';
export { FormGroup } from './components/FormGroup';

// Field Components
export {
  TextField,
  NumberField,
  EmailField,
  TextareaField,
  SelectField,
  ChoiceField,
  MultichoiceField,
  DateField,
  DatetimeField,
  FileField,
  ImageField,
  HiddenField,
  DummyField,
  getFieldComponent,
  registerFieldComponent,
  unregisterFieldComponent,
  hasFieldComponent,
  getRegisteredFieldTypes,
  fieldRegistry,
} from './components/fields';

// Common Components
export { Label } from './components/common/Label';
export { ErrorMessage } from './components/common/ErrorMessage';
export { Description } from './components/common/Description';

// Button Components
export { SubmitButton } from './components/buttons/SubmitButton';
export { ButtonGroup } from './components/buttons/ButtonGroup';

// ============================================================================
// Utilities
// ============================================================================
export {
  parsePathString,
  pathToString,
  getValueByPath,
  setValueByPath,
  deleteValueByPath,
  generateUniqueKey,
  isUniqueKey,
  extractUniqueKeys,
  getParentPath,
  getFieldName,
  joinPath,
  isChildPath,
  keysToIndices,
} from './utils/path';

// ============================================================================
// Types
// ============================================================================
export type {
  // Re-exported from validator
  Spec,
  FieldSpec,
  ActionSpec,
  ButtonSpec,
  ItemsSourceSpec,
  RulesSpec,
  MessagesSpec,
  ValidationResult,
  ValidationError,
  // Form types
  Language,
  MultiLangText,
  FormValue,
  FormData,
  FormErrors,
  // Component props
  FormBuilderProps,
  FieldComponentProps,
  WrapperRenderProps,
  ButtonsRenderProps,
  // Context types
  FormContextValue,
  I18nContextValue,
  // Hook types
  UseFormReturn,
  UseValidationReturn,
  UseConditionalReturn,
  UseMultipleReturn,
  ConditionalContext,
  AllOfCondition,
  AllOfResult,
  MultipleItem,
  // Display condition types
  DisplaySwitchConfig,
  DisplayTargetConfig,
  ElementConfig,
  AnyOfCondition,
  // Registry types
  FieldRegistryEntry,
  FieldRegistry,
  // Utility types
  DeepPartial,
  PathSegments,
  UniqueKey,
  GenerateKeyFn,
} from './types';

// ============================================================================
// Default Export
// ============================================================================
export { FormBuilder as default } from './components/FormBuilder';
