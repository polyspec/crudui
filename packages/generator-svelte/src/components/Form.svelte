<!-- @component
  Render an editable form instance and synchronize its data, row actions and input state.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { connectForm, type FormInstance } from '@crudui/generator-core';
  import FormFields from './FormFields.svelte';

  let { form }: { form: FormInstance } = $props();
  let root = $state<HTMLDivElement>();
  let snapshot = $state(untrack(() => form.getSnapshot()));
  let binding: ReturnType<typeof connectForm> | undefined;

  $effect(() => {
    const current = form;
    snapshot = current.getSnapshot();
    const unsubscribe = current.subscribe(() => { snapshot = current.getSnapshot(); });
    binding = connectForm(root!, current);
    return () => { binding?.disconnect(); unsubscribe(); };
  });
  // Reading the snapshot makes every new snapshot sync the rendered controls.
  $effect(() => { if (snapshot) binding?.sync(); });
</script>

<FormFields fields={snapshot.fields} buttons={snapshot.buttons} messages={form.messages} bind:root />
