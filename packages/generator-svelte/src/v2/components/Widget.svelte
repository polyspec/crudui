<!--
  v2 Svelte widget renderer — real `.svelte` container elements, raw control bodies.

  Receives the core's evaluated `WidgetModel` (markup-free) and renders the real
  CONTAINER element for its layout (`.input-group` / display `<div>`). The leaf
  CONTROL bytes (`<input>`/`<select><option>`/`<textarea>`) are injected via the
  container's `{@html}` directive — forced by svelte/server's boolean-attr
  coercion (see raw.ts), the same control-granularity boundary the Vue adapter
  uses. This component RECOMPUTES NOTHING.

  Sanctioned real-element-leaf cases (no boolean/empty attr hazard): the display
  RAW `<div>` (dummy/image-viewer body — a verbatim-content boundary) and the
  unsupported marker `<div>`. The root-raw layouts (bare/host-script/button/
  btn-group/search) are rendered at the `.input-group-wrapper` root by the field
  dispatcher via widgetRootRaw; this component renders nothing for them.
-->
<script lang="ts">
  import type { WidgetModel } from '@polyspec/generator-core';
  import { inputGroupBody, fileGroupBody, isUnsupported, type AnyWidget } from './widget';

  let { w }: { w: AnyWidget } = $props();

  const supported = $derived(!isUnsupported(w));
  const model = $derived(supported ? (w as WidgetModel) : null);
  // dummy-input is an input-group control, not a RAW display div.
  const isDisplayRaw = $derived(model?.layout === 'display' && model.kind !== 'dummy-input');
</script>

{#if !supported}
  <div class="form-element-unsupported" data-unsupported-type={(w as { type: string }).type}></div>
{:else if model.layout === 'input-group' || (model.layout === 'display' && model.kind === 'dummy-input')}
  <div class="input-group">{@html inputGroupBody(model)}</div>
{:else if model.layout === 'file'}
  <div class="input-group">{@html fileGroupBody(model)}</div>
{:else if isDisplayRaw}
  <!-- RAW html display (dummy/image-viewer) — unescaped v1 parity content. -->
  {#if model.attrs.class !== undefined && model.attrs.style !== undefined}
    <div class={model.attrs.class} style={model.attrs.style}>{@html model.rawHtml ?? ''}</div>
  {:else if model.attrs.class !== undefined}
    <div class={model.attrs.class}>{@html model.rawHtml ?? ''}</div>
  {:else if model.attrs.style !== undefined}
    <div style={model.attrs.style}>{@html model.rawHtml ?? ''}</div>
  {:else}
    <div>{@html model.rawHtml ?? ''}</div>
  {/if}
{/if}
