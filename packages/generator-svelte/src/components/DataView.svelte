<!-- @component
  Render the current submission data of a form instance.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { FormInstance } from '@crudui/generator-core';

  let { form }: { form: FormInstance } = $props();
  let data = $state(untrack(() => form.getData()));

  $effect(() => {
    const current = form;
    data = current.getData();
    return current.subscribe(() => { data = current.getData(); });
  });
</script>

<div class="crudui-data">
  <div class="crudui-data__header">{form.messages.data}</div>
  <pre class="crudui-data__body">{JSON.stringify(data, null, 2)}</pre>
</div>
