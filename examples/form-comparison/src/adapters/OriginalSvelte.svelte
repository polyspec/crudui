<script lang="ts">
  import { untrack } from 'svelte';
  import FormV2 from '#svelte/FormV2.svelte';
  let { build, initialData } = $props();
  let data = $state(untrack(() => initialData));
  const fields = $derived(build(data));
  export function load(next) { data = next; }
</script>

<FormV2 {fields} />
