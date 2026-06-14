/**
 * @crudui/generator-vue
 *
 * Vue 3 form builder component library based on form-spec YAML definitions,
 * byte-parity with the legacy Legacy PHP Generator output.
 *
 * @example
 * ```ts
 * import { createSSRApp, h } from 'vue';
 * import { renderToString } from '@vue/server-renderer';
 * import { FormBuilder } from '@crudui/generator-vue/legacy';
 *
 * const app = createSSRApp({ render: () => h(FormBuilder, { spec, data: {}, language: 'ko' }) });
 * const html = await renderToString(app);
 * ```
 */

export { FormBuilder, default as FormBuilderDefault } from './components/FormBuilder';
export { FormBuilder as default } from './components/FormBuilder';

export { createRenderContext, createTranslator, RENDER_CONTEXT_KEY } from './context';
export { renderFormField, renderFormGroup, isMultipleSpec } from './components/formTree';
export { renderButtonGroup } from './components/buttons';
export { getFieldRenderer } from './components/fields';

export {
  generateUniqid,
  resetUniqid,
  toBracketNotationWithPrefix,
} from './utils/dataAttributes';

export {
  phpString,
  phpTruthy,
  phpFloatString,
  cleanStr,
  leafName,
  ruleNameForPath,
  legacyDataAttrs,
  itemEntries,
  wrapperLayerName,
  nextChoiceToken,
  resetChoiceTokens,
} from './legacyParity';

export type {
  Spec,
  FieldSpec,
  ReactFieldSpec,
  FormData,
  FormValue,
  FormErrors,
  Language,
  MultiLangText,
  FormBuilderProps,
  FieldComponentProps,
  RenderContext,
} from './types';
