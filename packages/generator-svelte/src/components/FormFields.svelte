<script lang="ts">
  import type { FieldViewModel } from '@crudui/generator-core';
  import Field from './Field.svelte';

  let { fields, root = $bindable() }: { fields: FieldViewModel[]; root?: HTMLDivElement } = $props();
</script>

<div class="form-group" bind:this={root}>
  {#each fields as vm (vm.path)}
    <Field {vm} />
  {/each}
</div>
