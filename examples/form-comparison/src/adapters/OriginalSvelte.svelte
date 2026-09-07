<script lang="ts">
  import Form from '#svelte/Form.svelte';
  let { build } = $props();
  let data = $state({});
  const fields = $derived(build(data));
  export function load(next) { data = next; }
</script>

<Form {fields} />
