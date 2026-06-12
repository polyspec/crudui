<script lang="ts">
  import { checkboxInnerHtml, type FieldRenderCtx } from '../../fieldHtml';
  import { makeTranslate, type Language } from '../../i18n';
  import type { SpecNode } from './limepieParity';

  export let spec: SpecNode;
  export let value: unknown = undefined;
  export let path: string;
  export let keyPrefix = '';
  export let language: Language = 'ko';
  export let readonly = false;
  export let disabled = false;

  $: ctx = {
    spec,
    value,
    path,
    keyPrefix,
    language,
    t: makeTranslate(language),
    readonly: readonly || spec.readonly === true,
    disabled: disabled || spec.disabled === true,
  } satisfies FieldRenderCtx;
  $: html = checkboxInnerHtml(ctx);
</script>

{@html html}
