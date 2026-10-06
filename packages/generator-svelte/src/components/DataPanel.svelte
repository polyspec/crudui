<!-- @component
  Render current data markup directly from the data.
-->
<script lang="ts">
  import type { FormMessages } from '@polyspec/crudui-generator-core';

  let { data, messages }: { data: unknown; messages: FormMessages } = $props();
</script>

<div class="crudui-data">
  <div class="crudui-data__header">{messages.data}</div>
  <pre class="crudui-data__body">{JSON.stringify(data, null, 2)}</pre>
</div>
