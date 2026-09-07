<script lang="ts">
  import { untrack } from 'svelte';
  import Form from '#svelte/Form.svelte';
  let { build, initialData } = $props();
  let data = $state(untrack(() => initialData));
  const fields = $derived(build(data));
  export function load(next) { data = next; }
</script>

<Form {fields} />
