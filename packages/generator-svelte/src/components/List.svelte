<!-- @component
  Render an evaluated list model as a table or cards with display cells and row actions.
-->
<script lang="ts">
  import type { ListViewModel } from '@crudui/generator-core';
  import {
    headerClass,
    headerStyle,
    cellClass,
    cellStyle,
    sortMarker,
    sortDir,
    actionHtml,
    hasActions,
  } from './list';

  let {
    vm,
    layout = 'table',
  }: { vm: ListViewModel; layout?: 'table' | 'card' } = $props();

  const wrapperClass = $derived(
    ['crudui-list', vm.design.wrapper.class].filter((s) => s && s.trim()).join(' ').trim()
  );
  const wrapperStyle = $derived(vm.design.wrapper.style?.trim() || undefined);
  const isEmpty = $derived(vm.rows.length === 0);
  const showActions = $derived(hasActions(vm.actions));
</script>

<!-- One cell's DISPLAY, dispatched on the core CellDisplay union. A plain string
     (text/date/number/choice-label) renders as escaped text; the structured
     variants render real elements; ONLY `html` passes through `{@html}`. -->
{#snippet cellDisplay(d: import('@crudui/generator-core').CellDisplay)}
  {#if typeof d === 'string'}
    {d}
  {:else if d.kind === 'badge'}
    <span class="crudui-badge" data-crudui-variant={d.variant || undefined}>{d.label}</span>
  {:else if d.kind === 'link'}
    <a href={d.href} target={d.target ?? undefined}>{d.text}</a>
  {:else if d.kind === 'image'}
    <img src={d.src} alt={d.alt} width={d.width ?? undefined} height={d.height ?? undefined} />
  {:else if d.kind === 'bool'}
    {#if d.as === 'check'}
      <span class="crudui-bool crudui-bool--check" data-crudui-state={String(d.value)} aria-label={d.label}>{d.value ? '✔' : '✘'}</span>
    {:else if d.as === 'icon'}
      <span class="crudui-bool crudui-bool--icon" data-crudui-state={String(d.value)} aria-label={d.label}></span>
    {:else}
      <span class="crudui-bool crudui-bool--text" data-crudui-state={String(d.value)}>{d.label}</span>
    {/if}
  {:else if d.kind === 'html'}
    <!-- sanctioned raw boundary: verbatim row HTML the column format opted into. -->
    {@html d.html}
  {/if}
{/snippet}

<div class={wrapperClass} style={wrapperStyle}>
  {#if showActions}
    <div class="crudui-list__actions">
      {#each vm.actions as action (action.key)}
        <!-- sanctioned raw boundary: behavior on* chrome (opaque host scripts). -->
        <span class="crudui-list__action" data-action={action.key}>{@html actionHtml(action)}</span>
      {/each}
    </div>
  {/if}

  {#if isEmpty}
    <div class="crudui-list__empty">{vm.empty}</div>
  {:else if layout === 'card'}
    <div class="crudui-list__cards">
      {#each vm.rows as row, ri (ri)}
        <article class="crudui-list__card">
          {#each row.cells as cell, ci (ci)}
            {@const col = vm.columns[ci]}
            <div class={cellClass(cell)} style={cellStyle(cell)}>
              <span class="crudui-list__card-label">{col?.label ?? ''}</span>
              <span class="crudui-list__card-value">{@render cellDisplay(cell.display)}</span>
            </div>
          {/each}
        </article>
      {/each}
    </div>
  {:else}
    <table class="crudui-list__table">
      <thead>
        <tr>
          {#each vm.columns as col (col.key)}
            <th
              class={headerClass(col)}
              style={headerStyle(col)}
              data-field={col.field || undefined}
              data-sortable={col.sortable ? 'true' : undefined}
              data-sort-dir={sortDir(vm, col) ?? undefined}
            >
              <span class="crudui-list__heading-label">{col.label}</span>
              {#if col.sortable}<span class="crudui-list__sort">{sortMarker(col)}</span>{/if}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each vm.rows as row, ri (ri)}
          <tr>
            {#each row.cells as cell, ci (ci)}
              <td class={cellClass(cell)} style={cellStyle(cell)}>
                {@render cellDisplay(cell.display)}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  {#if vm.pagination.enabled}
    <nav
      class="crudui-list__pagination"
      data-mode={vm.pagination.mode ?? undefined}
      data-per-page={vm.pagination.perPage !== undefined ? String(vm.pagination.perPage) : undefined}
      data-page={vm.pagination.page !== undefined ? String(vm.pagination.page) : undefined}
      data-total={vm.pagination.total !== undefined ? String(vm.pagination.total) : undefined}
    ></nav>
  {/if}
</div>
