<script lang="ts">
  import { untrack } from 'svelte';
  import type { FieldViewModel } from '@crudui/generator-core';
  import FormFields from '#svelte/FormFields.svelte';

  let { initialFields }: { initialFields: FieldViewModel[] } = $props();
  let fields = $state(untrack(() => initialFields));
  export function load(next: FieldViewModel[]) { fields = next; }
</script>

<FormFields {fields} />
