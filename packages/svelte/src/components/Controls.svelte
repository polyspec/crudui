<!-- @component
  Render one control group of `data-crudui-action` buttons. Sibling buttons are written
  without whitespace between them; see Node.svelte.
-->
<script module lang="ts">
  import type { ControlsVM } from '@polyspec/crudui-generator-core';

  /** The props of the component Controls. */
  export interface ControlsProps {
    /** The control group to render. */
    controls: ControlsVM;
  }
</script>

<script lang="ts">
  let { controls }: ControlsProps = $props();
</script>

<div class="crudui-controls" role="group" aria-label={controls.label}
  >{#each controls.actions as action (action.name)}<button type="button" class="crudui-action" data-crudui-action={action.name} aria-label={action.label} aria-disabled={action.disabled ? 'true' : undefined}></button>{/each
}</div>
