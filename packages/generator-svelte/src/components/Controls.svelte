<!-- @component
  Render one control group of `data-crudui-action` buttons. Sibling buttons are written
  without whitespace between them; see Node.svelte.
-->
<script lang="ts">
  import type { ControlsVM } from '@crudui/generator-core';

  let { controls }: { controls: ControlsVM } = $props();
</script>

<div class="crudui-controls" role="group" aria-label={controls.label}
  >{#each controls.actions as action (action.name)}<button type="button" class="crudui-action" data-crudui-action={action.name} aria-label={action.label} aria-disabled={action.disabled ? 'true' : undefined}></button>{/each
}</div>
