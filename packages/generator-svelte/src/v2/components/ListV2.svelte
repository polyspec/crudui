<!--
  v2 Svelte list renderer — `ListV2` builds a `ListViewModel` as a real `.svelte`
  element tree (the read sister of `FormV2`). read-only: it renders DISPLAY
  cells, never input controls.

  It takes the core's already-built `ListViewModel` (compose + design eval + i18n
  + the read cell renderer) and lays it out as a table (default) or cards
  (`mode="card"`). A pure presentational `.svelte` tree: NO evaluation, NO string
  concatenation of structure, NO completed-list HTML echo. Every structural node
  (table/thead/tr/th/td, card list/article/row) is a REAL `.svelte` element; the
  cell DISPATCH (text/date/number/choice-label/badge/link/image/bool/html) is real
  `.svelte` branches over the core's `CellDisplay` union.

  Only TWO sanctioned raw boundaries pass through `{@html}` (the same policy as
  FormV2's leaf controls): the `html` cell display (verbatim row HTML the column
  format opted into) and an action's behavior on* chrome (opaque host scripts the
  core preserves verbatim, which svelte/server's dynamic spread would mangle). The
  appearance strings come pre-evaluated from the core's ResolvedDesign; this
  component RECOMPUTES NOTHING. eval is never called.
-->
<script lang="ts">
  import type { ListViewModel } from '@form-spec/generator-core';
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
    mode = 'table',
  }: { vm: ListViewModel; mode?: 'table' | 'card' } = $props();

  const wrapperClass = $derived(
    ['list-view', vm.design.wrapper.class].filter((s) => s && s.trim()).join(' ').trim()
  );
  const wrapperStyle = $derived(vm.design.wrapper.style?.trim() || undefined);
  const isEmpty = $derived(vm.rows.length === 0);
  const showActions = $derived(hasActions(vm.actions));
</script>

<!-- One cell's DISPLAY, dispatched on the core CellDisplay union. A plain string
     (text/date/number/choice-label) renders as escaped text; the structured
     variants render real elements; ONLY `html` passes through `{@html}`. -->
{#snippet cellDisplay(d: import('@form-spec/generator-core').CellDisplay)}
  {#if typeof d === 'string'}
    {d}
  {:else if d.kind === 'badge'}
    <span class={d.variant ? `badge badge-${d.variant}` : 'badge'}>{d.label}</span>
  {:else if d.kind === 'link'}
    <a href={d.href} target={d.target ?? undefined}>{d.text}</a>
  {:else if d.kind === 'image'}
    <img src={d.src} alt={d.alt} width={d.width ?? undefined} height={d.height ?? undefined} />
  {:else if d.kind === 'bool'}
    {#if d.as === 'check'}
      <span class="bool-check" aria-label={d.label}>{d.value ? '✔' : '✘'}</span>
    {:else if d.as === 'icon'}
      <span class={d.value ? 'bool-icon bool-true' : 'bool-icon bool-false'} aria-label={d.label}></span>
    {:else}
      <span class="bool-text">{d.label}</span>
    {/if}
  {:else if d.kind === 'html'}
    <!-- sanctioned raw boundary: verbatim row HTML the column format opted into. -->
    {@html d.html}
  {/if}
{/snippet}

<div class={wrapperClass} style={wrapperStyle}>
  {#if showActions}
    <div class="list-actions">
      {#each vm.actions as action (action.key)}
        <!-- sanctioned raw boundary: behavior on* chrome (opaque host scripts). -->
        <span class="list-action" data-action={action.key}>{@html actionHtml(action)}</span>
      {/each}
    </div>
  {/if}

  {#if isEmpty}
    <div class="list-empty">{vm.empty}</div>
  {:else if mode === 'card'}
    <div class="list-cards">
      {#each vm.rows as row, ri (ri)}
        <article class="list-card">
          {#each row.cells as cell, ci (ci)}
            {@const col = vm.columns[ci]}
            <div class={cellClass(cell)} style={cellStyle(cell)}>
              <span class="list-card-label">{col?.label ?? ''}</span>
              <span class="list-card-value">{@render cellDisplay(cell.display)}</span>
            </div>
          {/each}
        </article>
      {/each}
    </div>
  {:else}
    <table class="list-table">
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
              <span class="list-th-label">{col.label}</span>
              {#if col.sortable}<span class="list-sort">{sortMarker(col)}</span>{/if}
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
      class="list-pagination"
      data-mode={vm.pagination.mode ?? undefined}
      data-per-page={vm.pagination.perPage !== undefined ? String(vm.pagination.perPage) : undefined}
      data-page={vm.pagination.page !== undefined ? String(vm.pagination.page) : undefined}
      data-total={vm.pagination.total !== undefined ? String(vm.pagination.total) : undefined}
    ></nav>
  {/if}
</div>
