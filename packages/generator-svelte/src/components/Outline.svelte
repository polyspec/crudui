<!-- @component
  Render the structure map of a form instance with its form controls.
  Selecting a row scrolls the rendered form row into view.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { buildOutline, connectOutline, type FormInstance, type OutlineCollection } from '@crudui/generator-core';
  import Controls from './Controls.svelte';

  let { form, formElement }: { form: FormInstance; formElement?: HTMLElement } = $props();
  let root = $state<HTMLDivElement>();
  let snapshot = $state(untrack(() => form.getSnapshot()));

  $effect(() => {
    const current = form;
    snapshot = current.getSnapshot();
    return current.subscribe(() => { snapshot = current.getSnapshot(); });
  });
  $effect(() => {
    if (!root || !formElement) return;
    const connection = connectOutline(root, form, formElement);
    return () => connection.disconnect();
  });

  const collections = $derived(buildOutline(snapshot.fields, snapshot.selection));
  const messages = $derived(form.messages);
</script>

{#snippet collection(item: OutlineCollection)}
  <div class="crudui-node crudui-node--collection" data-field-path={item.path}>
    <div class="crudui-node__header">
      {#if item.label !== undefined}
        <span class="crudui-node__label">{item.label}</span>
      {/if}
      {#if item.count !== undefined}
        <span class="crudui-node__count">{item.count}</span>
      {/if}
      {#if item.controls}
        <Controls controls={item.controls} />
      {/if}
    </div>
    <div class="crudui-node__body">
      {#each item.rows as row (row.key)}
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
          {#if row.collections.length}
            <div class="crudui-node__body">
              {#each row.collections as nested (nested.path)}
                {@render collection(nested)}
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/snippet}

<div class="crudui-outline" bind:this={root}>
  <div class="crudui-outline__header">
    <div class="crudui-controls" role="group" aria-label={messages.formControls}>
      <button type="button" class="crudui-action crudui-action--text" data-crudui-action="expand-all">{messages.expandAll}</button>
      <button type="button" class="crudui-action crudui-action--text" data-crudui-action="collapse-all">{messages.collapseAll}</button>
      <button type="button" class="crudui-action crudui-action--text" data-crudui-action="undo" disabled={!snapshot.canUndo}>{messages.undo}</button>
    </div>
  </div>
  <div class="crudui-outline__body">
    {#each collections as item (item.path)}
      {@render collection(item)}
    {/each}
  </div>
</div>
