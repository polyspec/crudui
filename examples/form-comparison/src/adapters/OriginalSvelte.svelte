<script lang="ts">
  import FormV2 from '#svelte/FormV2.svelte';
  let { build } = $props();
  let data = $state({});
  const fields = $derived(build(data));
  export function load(next) { data = next; }
</script>

<FormV2 {fields} />
