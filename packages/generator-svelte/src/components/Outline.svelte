<!-- @component
  Render the structure map of a form instance with its form controls.
  Selecting a row scrolls the rendered form row into view.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { connectOutline, type FormInstance } from '@crudui/generator-core';
  import OutlineView from './OutlineView.svelte';

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
</script>

<OutlineView state={snapshot} messages={form.messages} bind:root />
