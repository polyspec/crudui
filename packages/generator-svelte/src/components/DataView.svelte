<!-- @component
  Render the current submission data of a form instance.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { FormInstance } from '@crudui/generator-core';
  import DataPanel from './DataPanel.svelte';

  let { form }: { form: FormInstance } = $props();
  let data = $state(untrack(() => form.getData()));

  $effect(() => {
    const current = form;
    data = current.getData();
    return current.subscribe(() => { data = current.getData(); });
  });
</script>

<DataPanel {data} messages={form.messages} />
