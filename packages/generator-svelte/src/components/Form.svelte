<!-- @component
  Render an editable form instance and synchronize its data, row actions and input state.
  `options` are the complete form options (form-runtime.md, "Complete form").
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { connectForm, type FormInstance, type FormRenderOptions } from '@polyspec/crudui-generator-core';
  import { formRenderModel } from '@polyspec/crudui-generator-core/internal';
  import FormFields from './FormFields.svelte';

  let { form, options }: { form: FormInstance; options?: FormRenderOptions } = $props();
  let root = $state<HTMLDivElement>();
  let snapshot = $state(untrack(() => form.getSnapshot()));
  let binding: ReturnType<typeof connectForm> | undefined;
  const model = $derived(formRenderModel(snapshot.fields, form.template.action, options));
  // Attribute values are option text; the form element writes them as given.
  const formAttributes = $derived(model.form as Record<string, string> | undefined);

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

{#if formAttributes}<form {...formAttributes}
  >{#each model.hidden as [name, value] (name)}<input type="hidden" {name} {value} />{/each}<FormFields fields={snapshot.fields} buttons={snapshot.buttons} messages={form.messages} {model} description={form.description} bind:root /></form
>{:else}<FormFields fields={snapshot.fields} buttons={snapshot.buttons} messages={form.messages} {model} description={form.description} bind:root />{/if}
