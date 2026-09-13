<!-- @component
  Render current data markup. Applications that own their data render it directly.
-->
<script lang="ts">
  import type { FormMessages } from '@crudui/generator-core';

  let { data, messages }: { data: unknown; messages: FormMessages } = $props();
</script>

<div class="crudui-data">
  <div class="crudui-data__header">{messages.data}</div>
  <pre class="crudui-data__body">{JSON.stringify(data, null, 2)}</pre>
</div>
