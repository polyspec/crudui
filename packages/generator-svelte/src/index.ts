/**
 * @form-spec/generator-svelte
 *
 * Svelte form builder component library based on form-spec YAML definitions.
 * Renders the same Limepie-compatible markup as @form-spec/generator-react
 * (reference-html parity).
 */

export { default as FormBuilder, buildFormContent } from './components/FormBuilder.svelte';
export { default as FormField } from './components/FormField.svelte';
export { default as FormGroup } from './components/FormGroup.svelte';

// Field components
export { default as TextField } from './components/fields/TextField.svelte';
export { default as EmailField } from './components/fields/EmailField.svelte';
export { default as PasswordField } from './components/fields/PasswordField.svelte';
export { default as NumberField } from './components/fields/NumberField.svelte';
export { default as TextareaField } from './components/fields/TextareaField.svelte';
export { default as SelectField } from './components/fields/SelectField.svelte';
export { default as CheckboxField } from './components/fields/CheckboxField.svelte';
export { default as ChoiceField } from './components/fields/ChoiceField.svelte';
export { default as MultichoiceField } from './components/fields/MultichoiceField.svelte';
export { default as DateField } from './components/fields/DateField.svelte';
export { default as DatetimeField } from './components/fields/DatetimeField.svelte';
export { default as DummyField } from './components/fields/DummyField.svelte';
export { default as ImageField } from './components/fields/ImageField.svelte';
export { default as SearchField } from './components/fields/SearchField.svelte';
export { default as TinymceField } from './components/fields/TinymceField.svelte';
export { default as ButtonField } from './components/fields/ButtonField.svelte';
export { default as SwitcherField } from './components/fields/SwitcherField.svelte';

// Rendering helpers (framework-independent)
export { renderFormContent, renderField, renderGroup } from './render';
export type { RenderState } from './render';
export { getFieldHtml } from './fieldHtml';
export type { FieldRenderCtx } from './fieldHtml';

// Transforms
export { applyDisplaySwitchTransform } from './legacyDisplay';
export { applyLangAppendTransform } from './legacyLang';

// Parity helpers
export * from './components/fields/limepieParity';
export { makeTranslate } from './i18n';
export type { Language, MultiLangText } from './i18n';
