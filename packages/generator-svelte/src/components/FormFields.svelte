<script lang="ts">
  import type { NodeVM } from '@crudui/generator-core';
  import Node from './Node.svelte';

  let { fields, root = $bindable() }: { fields: NodeVM[]; root?: HTMLDivElement } = $props();
</script>

<div class="crudui-form" bind:this={root}>
  <div class="crudui-form__body">
    {#each fields as vm (vm.path)}
      <Node {vm} />
    {/each}
  </div>
</div>
