<script lang="ts">
  import { setContext } from 'svelte';
  import { formButtonsHtml, type ButtonVM, type FormMessages, type NodeVM } from '@polyspec/crudui-generator-core';
  import type { FormRenderModel } from '@polyspec/crudui-generator-core/internal';
  import Node from './Node.svelte';
  import { NODE_ERRORS, type NodeErrorsSource } from './field.js';

  let { fields, buttons, messages, root = $bindable(), model, description = '' }: { fields: NodeVM[]; buttons: ButtonVM[]; messages: FormMessages; root?: HTMLDivElement; model?: FormRenderModel; description?: string } = $props();
  const formErrors = $derived(model?.formErrors ?? []);
  setContext<NodeErrorsSource>(NODE_ERRORS, () => model?.nodeErrors);
</script>

<!-- Sibling nodes are written without whitespace between them; see Node.svelte. -->
<div class="crudui-form" bind:this={root}
  >{#if description !== ''}<p class="crudui-form__description">{description}</p>{/if
  }{#if formErrors.length}<div class="crudui-form__errors">{#each formErrors as text, index (index)}<p class="crudui-form__error">{text}</p>{/each}</div>{/if
  }<div class="crudui-form__body">{#each fields as vm (vm.path)}<Node {vm} />{/each}</div
  ><div class="crudui-form__footer"><div class="crudui-controls" role="group" aria-label={messages.formActions}>{@html formButtonsHtml(buttons)}<!-- eslint-disable-line svelte/no-at-html-tags -- generator-core formButtonsHtml escapes the button markup. --></div></div
></div>
