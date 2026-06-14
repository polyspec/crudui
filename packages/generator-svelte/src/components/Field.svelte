<!--
  CRUDUI Svelte field dispatcher — the envelope, as a real `.svelte` element tree.

  Consumes one core `FieldViewModel` and builds the verified Legacy envelope:
  `.form-element-wrapper` (show=false → `style="display: none"`, DOM kept) >
  `<h6>` label (omitted for hidden) + `.description` + `.form-element` >
  `.input-group-wrapper[data-uniqid]` > widget. It dispatches the four field
  shapes (leaf / group / multiple-leaf|group / lang) plus the checkbox/switcher
  special envelope. Every envelope node is a real `.svelte` element; only the leaf
  CONTROL bytes are raw (Widget.svelte / widget.ts), injected at the container
  that owns them through `{@html}`.

  Appearance/visibility come pre-evaluated from the core's ResolvedDesign; this
  dispatcher only maps evaluated strings to class/style. svelte accepts a STRING
  `style` value verbatim (like Vue, no CSSProperties object). eval is never called.
-->
<script lang="ts">
  import type { FieldViewModel } from '@crudui/generator-core';
  import Widget from './Widget.svelte';
  import Self from './Field.svelte';
  import { widgetRootRaw, rowButtonsHtml } from './widget';
  import {
    wrapperClass,
    wrapperStyle,
    inputGroupWrapperClass,
    langCodeSpan,
  } from './field';

  let { vm }: { vm: FieldViewModel } = $props();

  const wClass = $derived(wrapperClass(vm));
  const wStyle = $derived(wrapperStyle(vm));
  const igwClass = $derived(inputGroupWrapperClass(vm));
  const labelClass = $derived(vm.design.label.class);
  const labelStyle = $derived(vm.design.label.style?.trim());
  const showLabel = $derived(vm.label && !vm.omitLabel);
  const groupStyle = $derived(vm.groupStyle?.trim());

  // Single-field widget: a root-raw widget (bare/host-script/button/btn-group/
  // search) is serialized at the .input-group-wrapper root; else a real Widget.
  const leafRaw = $derived(vm.widget ? widgetRootRaw(vm.widget) : null);
</script>

{#snippet labelAndDescription()}
  {#if showLabel}
    <h6 class={labelClass || undefined} style={labelStyle || undefined}>{vm.label}</h6>
  {/if}
  {#if vm.description}
    <p class="description">{vm.description}</p>
  {/if}
{/snippet}

<!-- Row action buttons as REAL .svelte elements (plus/minus/copy/move). Used
     wherever the row container does not already inject its children via {@html}.
     The btn-group input-group-btn / btn-delete distinctions come from the core
     multiple settings; the empty text matches the fixture after normalization. -->
{#snippet rowButtons(s: { show: boolean; max?: number; copy?: boolean; sortable?: boolean })}
  {#if s.sortable}
    <!-- svelte-ignore a11y_consider_explicit_label -->
    <button type="button" class="btn btn-move-up"> </button>
    <!-- svelte-ignore a11y_consider_explicit_label -->
    <button type="button" class="btn btn-move-down"> </button>
  {/if}
  <!-- svelte-ignore a11y_consider_explicit_label -->
  <button type="button" class="btn btn-plus" data-multiple-max={s.max !== undefined ? String(s.max) : undefined}> </button>
  {#if s.copy}
    <!-- svelte-ignore a11y_consider_explicit_label -->
    <button type="button" class="btn btn-copy"> </button>
  {/if}
  <!-- svelte-ignore a11y_consider_explicit_label -->
  <button type="button" class={s.copy ? 'btn btn-minus btn-delete' : 'btn btn-minus'}> </button>
{/snippet}

{#if vm.shape === 'leaf' && vm.checkbox}
  <!-- checkbox / switcher special envelope. The checkbox input carries only
       non-empty/non-boolean attrs (class/name/type/value="1") → it renders
       correctly as a real element. -->
  <div class={wClass} name={vm.wrapperName} style={wStyle}>
    <div class="checkbox">
      <h6>
        <div class={igwClass} data-uniqid={vm.uniqid}>
          <div>
            <input class={vm.checkboxClass} name={vm.checkboxName} type="checkbox" value="1" />
            <span>{vm.label}</span>
          </div>
        </div>
      </h6>
      {#if vm.description}
        <p class="description">{vm.description}</p>
      {/if}
    </div>
  </div>
{:else if vm.shape === 'leaf'}
  <div class={wClass} name={vm.wrapperName} style={wStyle}>
    {@render labelAndDescription()}
    <div class="form-element">
      {#if leafRaw !== null}
        <div class={igwClass} data-uniqid={vm.uniqid}>{@html leafRaw}</div>
      {:else}
        <div class={igwClass} data-uniqid={vm.uniqid}>
          {#if vm.widget}<Widget w={vm.widget} />{/if}
        </div>
      {/if}
    </div>
  </div>
{:else if vm.shape === 'group'}
  <div class={wClass} name={vm.wrapperName} style={wStyle}>
    {@render labelAndDescription()}
    <div class="form-element">
      <div class={igwClass} data-uniqid={vm.uniqid}>
        <div class={vm.groupClass} style={groupStyle || undefined}>
          {#each vm.children ?? [] as child (child.path)}
            <Self vm={child} />
          {/each}
        </div>
      </div>
    </div>
  </div>
{:else if vm.shape === 'multiple-leaf'}
  <div class={wClass} name={vm.wrapperName} style={wStyle}>
    {@render labelAndDescription()}
    <div class="form-element">
      {#each vm.rows ?? [] as row (row.uniqid)}
        {@const rowRaw = row.widget ? widgetRootRaw(row.widget) : null}
        {#if rowRaw !== null}
          <!-- Root-raw control under the row wrapper → inject + buttons as
               siblings is impossible ({@html} owns children); buttons appended
               into the raw. -->
          <div class={row.wrapperClass} data-uniqid={row.uniqid}>{@html rowRaw + (vm.multiple ? rowButtonsHtml(vm.multiple) : '')}</div>
        {:else}
          <div class={row.wrapperClass} data-uniqid={row.uniqid}>
            {#if row.widget}<Widget w={row.widget} />{/if}
            {#if vm.multiple}{@render rowButtons(vm.multiple)}{/if}
          </div>
        {/if}
      {/each}
    </div>
  </div>
{:else if vm.shape === 'multiple-group'}
  <div class={wClass} name={vm.wrapperName} style={wStyle}>
    {@render labelAndDescription()}
    <div class="form-element">
      {#each vm.rows ?? [] as row (row.uniqid)}
        <div class={row.wrapperClass} data-uniqid={row.uniqid}>
          <div class={row.groupClass}>
            {#each row.children ?? [] as child (child.path)}
              <Self vm={child} />
            {/each}
          </div>
          <span class="btn-group input-group-btn">{#if vm.multiple}{@render rowButtons(vm.multiple)}{/if}</span>
        </div>
      {/each}
    </div>
  </div>
{:else if vm.shape === 'lang'}
  <div class={wClass} name={vm.wrapperName} style={wStyle}>
    {@render labelAndDescription()}
    <div class="form-element">
      <div class={igwClass} data-uniqid={vm.uniqid}>
        <div class={vm.lang?.groupClass}>
          {#if vm.lang?.title}
            <div class="lang-title">{vm.lang.title}</div>
          {/if}
          {#each vm.lang?.children ?? [] as child (child.code)}
            {@const childRaw = widgetRootRaw(child.widget)}
            {#if childRaw !== null}
              <div class="lang-child" data-lang={child.code}>{@html langCodeSpan(child.code) + childRaw}</div>
            {:else}
              <div class="lang-child" data-lang={child.code}>
                <span class="input-group-text lang-code">{child.code}</span>
                <Widget w={child.widget} />
              </div>
            {/if}
          {/each}
        </div>
      </div>
    </div>
  </div>
{/if}
