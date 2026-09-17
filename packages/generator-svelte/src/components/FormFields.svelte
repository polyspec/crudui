<script lang="ts">
  import { formButtonsHtml, type ButtonVM, type FormMessages, type NodeVM } from '@crudui/generator-core';
  import Node from './Node.svelte';

  let { fields, buttons, messages, root = $bindable() }: { fields: NodeVM[]; buttons: ButtonVM[]; messages: FormMessages; root?: HTMLDivElement } = $props();
</script>

<!-- Sibling nodes are written without whitespace between them; see Node.svelte. -->
<div class="crudui-form" bind:this={root}
  ><div class="crudui-form__body">{#each fields as vm (vm.path)}<Node {vm} />{/each}</div
  ><div class="crudui-form__footer"><div class="crudui-controls" role="group" aria-label={messages.formActions}>{@html formButtonsHtml(buttons)}<!-- eslint-disable-line svelte/no-at-html-tags -- generator-core formButtonsHtml escapes the button markup. --></div></div
></div>
