<!-- @component
  Render the actions of a list or detail: `{block}__actions` with one `{block}__action` span per
  action, and nothing when there are no actions.
-->
<script lang="ts">
  import type { ActionVM } from '@crudui/generator-core';
  import { actionHtml, hasActions } from './list.js';
  import { patched, firstMarkup } from './raw.js';

  let { actions, block }: { actions: ActionVM[]; block: 'crudui-list' | 'crudui-detail' } = $props();
</script>

{#if hasActions(actions)}
  <div class="{block}__actions">
    {#each actions as action (action.key)}
      <!-- sanctioned raw boundary: behavior on* chrome (opaque host scripts). -->
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- actionHtml escapes the action text and attributes; only declared on* scripts pass through. -->
      <span class="{block}__action" data-action={action.key} {@attach patched(actionHtml(action))}>{@html firstMarkup(() => actionHtml(action))}</span>
    {/each}
  </div>
{/if}
