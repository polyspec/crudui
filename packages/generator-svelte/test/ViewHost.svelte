<!-- @component
  Test host that renders the list or detail a store names and updates it in place.
-->
<script>
  import { buildDetail, buildList } from '@crudui/generator-core';
  import List from '../src/components/List.svelte';
  import Detail from '../src/components/Detail.svelte';

  let { source } = $props();
  const view = $derived($source);
</script>

{#if view.kind === 'list' && view.layout === 'card'}
  <List vm={buildList(view.spec, view.data)} layout="card" />
{:else if view.kind === 'list'}
  <List vm={buildList(view.spec, view.data)} layout="table" />
{:else}
  <Detail vm={buildDetail(view.spec, view.data)} />
{/if}
