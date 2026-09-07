<script lang="ts">
  import { untrack } from 'svelte';
  import { connectForm, type FormSession } from '@crudui/generator-core';
  import Field from './Field.svelte';

  let { session }: { session: FormSession } = $props();
  let root: HTMLDivElement;
  let snapshot = $state(untrack(() => session.getSnapshot()));
  let binding: ReturnType<typeof connectForm> | undefined;

  $effect(() => {
    const current = session;
    snapshot = current.getSnapshot();
    const unsubscribe = current.subscribe(() => { snapshot = current.getSnapshot(); });
    binding = connectForm(root, current);
    return () => { binding?.disconnect(); unsubscribe(); };
  });
  $effect(() => { snapshot; binding?.sync(); });
</script>

<div class="form-group" bind:this={root}>
  {#each snapshot.fields as vm (vm.path)}
    <Field {vm} />
  {/each}
</div>
