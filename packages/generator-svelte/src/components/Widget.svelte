<!-- @component
  Render an evaluated widget and its native controls inside the required container.
-->
<script lang="ts">
  import type { WidgetModel } from '@crudui/generator-core';
  import {
    affixHtml, widgetBody, fileGroupBody, isUnsupported, usesStableControl,
    type AnyWidget,
  } from './widget';

  let { w }: { w: AnyWidget } = $props();

  const model = $derived(isUnsupported(w) ? null : w);
  // dummy-input is a widget control, not a RAW display div.
  const isDisplayRaw = $derived(model?.layout === 'display' && model.kind !== 'dummy-input');
</script>

{#if !model}
  <div class="crudui-widget crudui-widget--unsupported" data-unsupported-type={(w as { type: string }).type}></div>
{:else if model.layout === 'bare' && usesStableControl(model)}
  <input {...model.attrs} />
{:else if model.layout === 'widget' || (model.layout === 'display' && model.kind === 'dummy-input')}
  <div class="crudui-widget">{#if usesStableControl(model)}{@html affixHtml(model.prepend)}{#if model.tag === 'textarea'}<textarea {...model.attrs}>{model.text ?? ''}</textarea>{:else}<input {...model.attrs} />{/if}{@html affixHtml(model.append)}{:else}{@html widgetBody(model)}{/if}</div>
{:else if model.layout === 'file'}
  <div class="crudui-widget">{@html fileGroupBody(model)}</div>
{:else if isDisplayRaw}
  <!-- RAW html display (dummy/image-viewer) — unescaped legacy parity content. -->
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
