<!-- @component
  Render current data markup directly from the data.
-->
<script module lang="ts">
  import type { FormMessages } from '@polyspec/crudui-generator-core';

  /** The props of the component DataPanel. */
  export interface DataPanelProps {
    /** The data to show. */
    data: unknown;
    /** The interface text of the panel. */
    messages: FormMessages;
  }
</script>

<script lang="ts">
  let { data, messages }: DataPanelProps = $props();
</script>

<div class="crudui-data">
  <div class="crudui-data__header">{messages.data}</div>
  <pre class="crudui-data__body">{JSON.stringify(data, null, 2)}</pre>
</div>
