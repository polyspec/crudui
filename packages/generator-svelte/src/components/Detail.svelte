<!-- @component
  Render an evaluated read-only detail model with shared CRUDUI display cells.
-->
<script lang="ts">
  import type { DetailViewModel, CellDisplay } from '@crudui/generator-core';

  let { vm }: { vm: DetailViewModel } = $props();
  const wrapperClass = $derived(['detail-view', vm.design.wrapper.class].filter((s) => s && s.trim()).join(' ').trim());
  const wrapperStyle = $derived(vm.design.wrapper.style?.trim() || undefined);
</script>

{#snippet cellDisplay(display: CellDisplay)}
  {#if typeof display === 'string'}
    {display}
  {:else if display.kind === 'badge'}
    <span class={display.variant ? `badge badge-${display.variant}` : 'badge'}>{display.label}</span>
  {:else if display.kind === 'link'}
    <a href={display.href} target={display.target ?? undefined}>{display.text}</a>
  {:else if display.kind === 'image'}
    <img src={display.src} alt={display.alt} width={display.width ?? undefined} height={display.height ?? undefined} />
  {:else if display.kind === 'bool'}
    {#if display.as === 'check'}
      <span class="bool-check" aria-label={display.label}>{display.value ? '✔' : '✘'}</span>
    {:else if display.as === 'icon'}
      <span class={display.value ? 'bool-icon bool-true' : 'bool-icon bool-false'} aria-label={display.label}></span>
    {:else}
      <span class="bool-text">{display.label}</span>
    {/if}
  {:else if display.kind === 'html'}
    {@html display.html}
  {/if}
{/snippet}

<dl class={wrapperClass} style={wrapperStyle}>
  {#each vm.fields as field (field.key)}
    <div class="detail-field">
      <dt class="detail-label">{field.label}</dt>
      <dd
        class={['detail-value', `detail-value-${field.format.type}`, field.design.main.class].filter((s) => s && s.trim()).join(' ').trim()}
        style={field.design.main.style?.trim() || undefined}
      >{@render cellDisplay(field.display)}</dd>
    </div>
  {/each}
</dl>
