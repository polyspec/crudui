<script lang="ts">
  import type { NodeVM } from '@crudui/generator-core';
  import Controls from './Controls.svelte';
  import { classes } from './field';

  let { vm }: { vm: NodeVM } = $props();
  const header = $derived(vm.header);
</script>

<div class={classes('crudui-node__header', header?.className)} style={header?.style}
  >{#if vm.collapsible}<button type="button" class="crudui-action" data-crudui-action="toggle-row" aria-expanded={vm.expanded === true ? 'true' : 'false'} aria-controls={vm.body.id} aria-label={vm.toggleLabel}></button>{/if
  }{#if header?.label !== undefined}{#if header.labelFor}<label class="crudui-node__label" for={header.labelFor}>{header.label}</label>{:else}<span class="crudui-node__label">{header.label}</span>{/if}{/if
  }{#if header?.description !== undefined}<p class="crudui-node__description">{header.description}</p>{/if
  }{#if header?.number !== undefined}<span class="crudui-node__number">{header.number}</span>{/if
  }{#if header?.title !== undefined}<span class="crudui-node__title">{header.title}</span>{/if
  }{#if header?.summary !== undefined}<span class="crudui-node__summary" hidden={vm.expanded === true}>{header.summary}</span>{/if
  }{#if header?.count !== undefined}<span class="crudui-node__count">{header.count}</span>{/if
  }{#if vm.controls?.placement === 'header'}<Controls controls={vm.controls} />{/if
}</div>
