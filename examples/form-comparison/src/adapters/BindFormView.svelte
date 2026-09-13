<script lang="ts">
  import { untrack } from 'svelte';
  import type { ButtonVM, FormMessages, NodeVM } from '@crudui/generator-core';
  import FormFields from '#svelte/FormFields.svelte';
  import OutlineView from '#svelte/OutlineView.svelte';
  import DataPanel from '#svelte/DataPanel.svelte';

  interface BoundForm {
    fields: NodeVM[];
    buttons: ButtonVM[];
    data: Record<string, unknown>;
    canUndo: boolean;
  }

  let { initial, messages }: { initial: BoundForm; messages: FormMessages } = $props();
  let current = $state.raw(untrack(() => initial));
  export function load(next: BoundForm) { current = next; }
</script>

<FormFields fields={current.fields} buttons={current.buttons} {messages} />
<OutlineView state={current} {messages} />
<DataPanel data={current.data} {messages} />
