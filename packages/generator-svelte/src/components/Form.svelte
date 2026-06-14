<!--
  CRUDUI Svelte form renderer — `Form` builds the composed field list as a real
  `.svelte` element tree.

  It takes the core's already-built `FieldViewModel[]` (compose + design eval +
  i18n + tree) and maps each top-level field to a `Field` element inside the
  `.form-group` envelope. A pure presentational `.svelte` tree: no evaluation, no
  string concatenation, no completed-form HTML echo. SSR via svelte/server
  render() produces the Limepie envelope byte-compatibly after normalization.
-->
<script lang="ts">
  import type { FieldViewModel } from '@form-spec/generator-core';
  import Field from './Field.svelte';

  let { fields }: { fields: FieldViewModel[] } = $props();
</script>

<div class="form-group">
  {#each fields as vm (vm.path)}
    <Field {vm} />
  {/each}
</div>
