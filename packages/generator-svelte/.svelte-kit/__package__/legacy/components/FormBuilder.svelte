<script lang="ts" context="module">
  import YAML from 'yaml';
  import { applyDisplaySwitchTransform } from '../legacyDisplay';
  import { applyLangAppendTransform } from '../legacyLang';
  import { renderFormContent, type RenderState } from '../render';
  import { resetUniqid } from '../utils';
  import { resetChoiceTokens, type SpecNode } from './fields/limepieParity';
  import { makeTranslate, type Language } from '../i18n';

  /**
   * Build the form CONTENT HTML (no <form> wrapper) for a parsed spec.
   * Applies the legacy render-spec transforms (lang: append, then
   * display_switch) in parser order, exactly like generator-react's
   * FormContext renderSpec, then renders the field tree.
   */
  export function buildFormContent(
    rawSpec: SpecNode | string,
    data: Record<string, unknown>,
    language: Language
  ): string {
    const parsed: SpecNode =
      typeof rawSpec === 'string' ? (YAML.parse(rawSpec) as SpecNode) : rawSpec;

    // Deterministic id/token sequences per render (SSR-stable).
    resetUniqid();
    resetChoiceTokens();

    const renderSpec = applyDisplaySwitchTransform(
      applyLangAppendTransform(parsed, language)
    ) as SpecNode;

    const state: RenderState = {
      rootSpec: renderSpec,
      data: data ?? {},
      keyPrefix: typeof renderSpec.key === 'string' ? renderSpec.key : '',
      language,
      t: makeTranslate(language),
    };
    return renderFormContent(renderSpec, state);
  }
</script>

<script lang="ts">

  /** Form specification (parsed object or YAML string). */
  export let spec: SpecNode | string;
  /** Initial form data. */
  export let data: Record<string, unknown> = {};
  /** UI language (label localization). */
  export let language: Language = 'ko';
  /** Optional extra class on the <form> element. */
  export let className: string | undefined = undefined;

  $: content = buildFormContent(spec, data, language);
  $: formClass = className ? `form-builder ${className}` : 'form-builder';
</script>

<form class={formClass} novalidate>
  {@html content}
</form>
