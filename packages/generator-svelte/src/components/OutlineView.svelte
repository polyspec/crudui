<!-- @component
  Render structure map markup for evaluated nodes, selection and undo availability.
  Applications that own their data render it from `bindForm`.
-->
<script lang="ts">
  import { buildOutline, type FormMessages, type OutlineRow, type OutlineState } from '@crudui/generator-core';
  import Controls from './Controls.svelte';

  let { state, messages, root = $bindable() }: { state: OutlineState; messages: FormMessages; root?: HTMLDivElement } = $props();

  const rows = $derived(buildOutline(state.fields, state.selection));
</script>

{#snippet outlineRow(row: OutlineRow)}
  <div class="crudui-node crudui-node--row" data-field-path={row.path} data-crudui-row-key={row.key} aria-current={row.current ? 'true' : undefined}>
    <div class="crudui-node__header">
      <button type="button" class="crudui-action crudui-action--text" data-crudui-action="select-row">
        {#if row.number !== undefined}<span class="crudui-node__number">{row.number}</span>{/if}
        {#if row.title !== undefined}<span class="crudui-node__title">{row.title}</span>{/if}
      </button>
      {#if row.controls}
        <Controls controls={row.controls} />
      {/if}
    </div>
    {#if row.rows.length}
      <div class="crudui-node__body">
        {#each row.rows as nested (nested.key)}
          {@render outlineRow(nested)}
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

<div class="crudui-outline" bind:this={root}>
  <div class="crudui-outline__header">
    <div class="crudui-controls" role="group" aria-label={messages.formControls}>
      <button type="button" class="crudui-action crudui-action--text" data-crudui-action="expand-all">{messages.expandAll}</button>
      <button type="button" class="crudui-action crudui-action--text" data-crudui-action="collapse-all">{messages.collapseAll}</button>
      <button type="button" class="crudui-action crudui-action--text" data-crudui-action="undo" disabled={!state.canUndo}>{messages.undo}</button>
    </div>
  </div>
  <div class="crudui-outline__body">
    {#each rows as row (row.key)}
      {@render outlineRow(row)}
    {/each}
  </div>
</div>
