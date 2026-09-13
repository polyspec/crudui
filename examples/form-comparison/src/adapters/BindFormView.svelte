<script lang="ts">
  import { untrack } from 'svelte';
  import type { FormMessages, NodeVM, RowSelection } from '@crudui/generator-core';
  import FormFields from '#svelte/FormFields.svelte';
  import OutlineView from '#svelte/OutlineView.svelte';
  import DataPanel from '#svelte/DataPanel.svelte';

  interface BoundForm {
    fields: NodeVM[];
    data: Record<string, unknown>;
    selection?: RowSelection;
    canUndo: boolean;
  }

  let { initial, messages }: { initial: BoundForm; messages: FormMessages } = $props();
  let current = $state.raw(untrack(() => initial));
  export function load(next: BoundForm) { current = next; }
</script>

<FormFields fields={current.fields} />
<OutlineView state={current} {messages} />
<DataPanel data={current.data} {messages} />
