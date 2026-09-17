<!-- @component
  Render an evaluated widget and its native controls inside the required container.
-->
<script lang="ts">
  import {
    affixHtml, widgetBody, fileGroupBody, isUnsupported, usesStableControl,
    type AnyWidget,
  } from './widget';
  import { patched, firstMarkup } from './raw';

  let { w }: { w: AnyWidget } = $props();

  const model = $derived(isUnsupported(w) ? null : w);
  // dummy-input is a widget control, not a RAW display div.
  const isDisplayRaw = $derived(model?.layout === 'display' && model.kind !== 'dummy-input');
</script>

{#if !model}
  <div class="crudui-widget crudui-widget--unsupported" data-unsupported-type={(w as { type: string }).type}></div>
{:else if model.layout === 'bare' && usesStableControl(model)}
  <!-- Server rendering writes value and text; defaultValue keeps them in the browser DOM. -->
  <input {...model.attrs} defaultValue={model.attrs.value} />
{:else if model.layout === 'widget' || (model.layout === 'display' && model.kind === 'dummy-input')}
  <!-- eslint-disable svelte/no-at-html-tags -- control bytes serialized with escaping in raw.ts (see its header). -->
  {#if usesStableControl(model)}
    <div class="crudui-widget">{@html affixHtml(model.prepend)}{#if model.tag === 'textarea'}<textarea {...model.attrs} defaultValue={model.text ?? ''}>{model.text ?? ''}</textarea>{:else}<input {...model.attrs} defaultValue={model.attrs.value} />{/if}{@html affixHtml(model.append)}</div>
  {:else}
    <div class="crudui-widget" {@attach patched(widgetBody(model))}>{@html firstMarkup(() => widgetBody(model))}</div>
  {/if}
{:else if model.layout === 'file'}
  <div class="crudui-widget" {@attach patched(fileGroupBody(model))}>{@html firstMarkup(() => fileGroupBody(model))}</div>
  <!-- eslint-enable svelte/no-at-html-tags -->
{:else if isDisplayRaw}
  <!-- RAW html display (dummy/image-viewer) — unescaped content. -->
  <!-- eslint-disable svelte/no-at-html-tags -- dummy and image-viewer widgets declare raw HTML content. -->
  {#if model.attrs.class !== undefined && model.attrs.style !== undefined}
    <div class={model.attrs.class} style={model.attrs.style} {@attach patched(model.rawHtml ?? '')}>{@html firstMarkup(() => model.rawHtml ?? '')}</div>
  {:else if model.attrs.class !== undefined}
    <div class={model.attrs.class} {@attach patched(model.rawHtml ?? '')}>{@html firstMarkup(() => model.rawHtml ?? '')}</div>
  {:else if model.attrs.style !== undefined}
    <div style={model.attrs.style} {@attach patched(model.rawHtml ?? '')}>{@html firstMarkup(() => model.rawHtml ?? '')}</div>
  {:else}
    <div {@attach patched(model.rawHtml ?? '')}>{@html firstMarkup(() => model.rawHtml ?? '')}</div>
  {/if}
  <!-- eslint-enable svelte/no-at-html-tags -->
{/if}
