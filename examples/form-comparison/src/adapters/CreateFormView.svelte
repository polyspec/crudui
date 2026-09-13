<script lang="ts">
  import type { FormInstance } from '@crudui/generator-core';
  import Form from '#svelte/Form.svelte';
  import Outline from '#svelte/Outline.svelte';
  import DataView from '#svelte/DataView.svelte';

  let { form, formElement }: { form: FormInstance; formElement: HTMLElement } = $props();
</script>

<Form {form} />
<Outline {form} {formElement} />
<DataView {form} />
