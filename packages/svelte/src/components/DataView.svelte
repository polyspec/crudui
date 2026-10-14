<!-- @component
  Render the current submission data of a form instance.
-->
<script module lang="ts">
  import type { FormInstance } from '@polyspec/crudui-generator-core';

  /** The props of the component DataView. */
  export interface DataViewProps {
    /** The form instance whose submission data is shown. */
    form: FormInstance;
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import DataPanel from './DataPanel.svelte';

  let { form }: DataViewProps = $props();
  let data = $state(untrack(() => form.getData()));

  $effect(() => {
    const current = form;
    data = current.getData();
    return current.subscribe(() => { data = current.getData(); });
  });
</script>

<DataPanel {data} messages={form.messages} />
