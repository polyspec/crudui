<!-- @component
  Render the structure map of a form instance with its form controls.
  Selecting a row scrolls the rendered form row into view.
-->
<script module lang="ts">
  import type { FormInstance } from '@polyspec/crudui-generator-core';

  /** The props of the component Outline. */
  export interface OutlineProps {
    /** The form instance whose structure map is rendered. */
    form: FormInstance;
    /** The rendered form element, into which a selected row scrolls. */
    formElement?: HTMLElement;
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { connectOutline } from '@polyspec/crudui-generator-core';
  import OutlineView from './OutlineView.svelte';

  let { form, formElement }: OutlineProps = $props();
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
