/**
 * Field Components Registry
 *
 * Maps field types to their React components
 */

import type { FieldRegistry, FieldComponentProps } from '../../types';
import { TextField } from './TextField';
import { NumberField } from './NumberField';
import { EmailField } from './EmailField';
import { TextareaField } from './TextareaField';
import { SelectField } from './SelectField';
import { ChoiceField } from './ChoiceField';
import { MultichoiceField } from './MultichoiceField';
import { DateField } from './DateField';
import { DatetimeField } from './DatetimeField';
import { FileField } from './FileField';
import { ImageField } from './ImageField';
import { HiddenField } from './HiddenField';
import { DummyField } from './DummyField';
import { PasswordField } from './PasswordField';
import { TimeField } from './TimeField';
import { CheckboxField } from './CheckboxField';
import { SearchField } from './SearchField';
import { TagifyField } from './TagifyField';
import { TinymceField } from './TinymceField';
import { SummernoteField } from './SummernoteField';
import { EditorjsField } from './EditorjsField';
import { BrowserImageField } from './BrowserImageField';
import { CoverField } from './CoverField';
import { PostcodeField } from './PostcodeField';
import { JusoField } from './JusoField';
import { KakaomapField } from './KakaomapField';
import { GeometryField } from './GeometryField';
import { SwitcherField } from './SwitcherField';
import { ButtonField } from './ButtonField';

/**
 * Built-in field registry
 */
const fieldRegistry: FieldRegistry = new Map();

// Register built-in field types
// Basic input types
fieldRegistry.set('text', TextField);
fieldRegistry.set('string', TextField); // Alias
fieldRegistry.set('number', NumberField);
fieldRegistry.set('integer', NumberField); // Alias
fieldRegistry.set('float', NumberField); // Alias
fieldRegistry.set('decimal', NumberField); // Alias
fieldRegistry.set('email', EmailField);
fieldRegistry.set('password', PasswordField);
fieldRegistry.set('textarea', TextareaField);
fieldRegistry.set('time', TimeField);

// Selection types
fieldRegistry.set('select', SelectField);
fieldRegistry.set('dropdown', SelectField); // Alias
fieldRegistry.set('choice', ChoiceField);
fieldRegistry.set('radio', ChoiceField); // Alias
fieldRegistry.set('multichoice', MultichoiceField);
fieldRegistry.set('checkboxes', MultichoiceField); // Alias (checkbox group)

// Single checkbox (boolean)
fieldRegistry.set('checkbox', CheckboxField);
fieldRegistry.set('bool', CheckboxField); // Alias
fieldRegistry.set('boolean', CheckboxField); // Alias

// Date/Time types
fieldRegistry.set('date', DateField);
fieldRegistry.set('datetime', DatetimeField);
fieldRegistry.set('datetime-local', DatetimeField); // Alias

// File types
fieldRegistry.set('file', FileField);
fieldRegistry.set('image', ImageField);
fieldRegistry.set('browser_image', BrowserImageField);
fieldRegistry.set('browserimage', BrowserImageField); // Alias
fieldRegistry.set('cover', CoverField);

// Search/Autocomplete
fieldRegistry.set('search', SearchField);
fieldRegistry.set('autocomplete', SearchField); // Alias

// Tag input
fieldRegistry.set('tagify', TagifyField);
fieldRegistry.set('tags', TagifyField); // Alias

// Rich text editors (placeholders)
fieldRegistry.set('tinymce', TinymceField);
fieldRegistry.set('wysiwyg', TinymceField); // Alias
fieldRegistry.set('summernote', SummernoteField);
fieldRegistry.set('editorjs', EditorjsField);
fieldRegistry.set('editor.js', EditorjsField); // Alias

// Address types
fieldRegistry.set('postcode', PostcodeField);
fieldRegistry.set('zipcode', PostcodeField); // Alias
fieldRegistry.set('juso', JusoField);
fieldRegistry.set('address', JusoField); // Alias

// Map/Geo types
fieldRegistry.set('kakaomap', KakaomapField);
fieldRegistry.set('map', KakaomapField); // Alias
fieldRegistry.set('geometry', GeometryField);
fieldRegistry.set('geo', GeometryField); // Alias
fieldRegistry.set('geojson', GeometryField); // Alias

// Toggle/Switch
fieldRegistry.set('switcher', SwitcherField);
fieldRegistry.set('switch', SwitcherField); // Alias
fieldRegistry.set('toggle', SwitcherField); // Alias

// Button
fieldRegistry.set('button', ButtonField);
fieldRegistry.set('action', ButtonField); // Alias

// Special types
fieldRegistry.set('hidden', HiddenField);
fieldRegistry.set('dummy', DummyField);
fieldRegistry.set('html', DummyField); // Alias
fieldRegistry.set('static', DummyField); // Alias

/**
 * Get field component by type
 */
export function getFieldComponent(type: string): React.ComponentType<FieldComponentProps> | undefined {
  return fieldRegistry.get(type.toLowerCase());
}

/**
 * Register a custom field component
 */
export function registerFieldComponent(
  type: string,
  component: React.ComponentType<FieldComponentProps>
): void {
  fieldRegistry.set(type.toLowerCase(), component);
}

/**
 * Unregister a field component
 */
export function unregisterFieldComponent(type: string): boolean {
  return fieldRegistry.delete(type.toLowerCase());
}

/**
 * Check if a field type is registered
 */
export function hasFieldComponent(type: string): boolean {
  return fieldRegistry.has(type.toLowerCase());
}

/**
 * Get all registered field types
 */
export function getRegisteredFieldTypes(): string[] {
  return Array.from(fieldRegistry.keys());
}

// Export all field components
export { TextField } from './TextField';
export { NumberField } from './NumberField';
export { EmailField } from './EmailField';
export { TextareaField } from './TextareaField';
export { SelectField } from './SelectField';
export { ChoiceField } from './ChoiceField';
export { MultichoiceField } from './MultichoiceField';
export { DateField } from './DateField';
export { DatetimeField } from './DatetimeField';
export { FileField } from './FileField';
export { ImageField } from './ImageField';
export { HiddenField } from './HiddenField';
export { DummyField } from './DummyField';
export { PasswordField } from './PasswordField';
export { TimeField } from './TimeField';
export { CheckboxField } from './CheckboxField';
export { SearchField } from './SearchField';
export { TagifyField } from './TagifyField';
export { TinymceField } from './TinymceField';
export { SummernoteField } from './SummernoteField';
export { EditorjsField } from './EditorjsField';
export { BrowserImageField } from './BrowserImageField';
export { CoverField } from './CoverField';
export { PostcodeField } from './PostcodeField';
export { JusoField } from './JusoField';
export { KakaomapField } from './KakaomapField';
export { GeometryField } from './GeometryField';
export { SwitcherField } from './SwitcherField';
export { ButtonField } from './ButtonField';

export { fieldRegistry };
