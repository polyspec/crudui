<script lang="ts">
  import { getFieldHtml, type FieldRenderCtx } from "../../fieldHtml";
  import { makeTranslate, type Language } from "../../i18n";
  import type { SpecNode } from "./limepieParity";

  export let spec: SpecNode;
  export let value: unknown = undefined;
  export let path: string;
  export let keyPrefix = "";
  export let language: Language = "ko";
  export let readonly = false;
  export let disabled = false;
  export let buttonsHtml: string | undefined = undefined;
  export let buttonsJsx: string | undefined = undefined;

  $: ctx = {
    spec,
    value,
    path,
    keyPrefix,
    language,
    t: makeTranslate(language),
    readonly: readonly || spec.readonly === true,
    disabled: disabled || spec.disabled === true,
    buttonsHtml,
    buttonsJsx,
  } satisfies FieldRenderCtx;
  $: html = getFieldHtml("email")!(ctx);
</script>

{@html html}
