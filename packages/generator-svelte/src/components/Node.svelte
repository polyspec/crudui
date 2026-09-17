<!-- @component
  Render one node of the recursive form grammar: `crudui-node` with its kind
  modifier and the shared header, body and footer slots.

  Sibling nodes are written without whitespace between them (line breaks fall inside
  tags): every renderer produces the same DOM, and Svelte keeps whitespace between
  sibling nodes as text.
-->
<script lang="ts">
  import type { NodeVM } from '@crudui/generator-core';
  import Controls from './Controls.svelte';
  import Header from './Header.svelte';
  import Widget from './Widget.svelte';
  import Self from './Node.svelte';
  import { widgetRootRaw } from './widget';
  import { classes, rootStyle } from './field';

  let { vm }: { vm: NodeVM } = $props();

  const header = $derived(vm.header);
  const hasHeader = $derived(vm.collapsible === true || header !== undefined || vm.controls?.placement === 'header');
  const widgetRaw = $derived(vm.widget ? widgetRootRaw(vm.widget) : null);
  const bodyHidden = $derived(vm.collapsible === true && vm.expanded !== true);
  const pathAttribute = $derived(vm.kind === 'row' || vm.kind === 'lang-item' ? undefined : vm.path);
</script>

<div class={classes('crudui-node', `crudui-node--${vm.kind}`, vm.sticky && 'crudui-node--sticky', vm.className)} style={rootStyle(vm)} data-field-path={pathAttribute} data-crudui-row-key={vm.key} data-lang={vm.lang} hidden={vm.hidden}
  >{#if hasHeader}{#if vm.sticky}<div class="crudui-node__header-container"><Header vm={vm} /></div>{:else}<Header vm={vm} />{/if}{/if
  }<div class={classes('crudui-node__body', vm.body.className)} style={vm.body.style} id={vm.body.id} hidden={bodyHidden}
    >{#if vm.checkbox}<input class={vm.checkbox.className} id={vm.checkbox.id} name={vm.checkbox.name} type="checkbox" value="1" checked={vm.checkbox.checked || undefined} defaultChecked={vm.checkbox.checked} /><label for={vm.checkbox.id}>{#if vm.checkbox.caption}{vm.checkbox.caption}{/if}</label
    >{:else if widgetRaw !== null}{@html widgetRaw}{:else if vm.widget}<Widget w={vm.widget} />{:else}{#each vm.children ?? [] as child, index (child.key ?? child.path ?? child.lang ?? index)}<Self vm={child} />{/each}{/if
  }</div>{#if vm.controls?.placement === 'footer'}<div class="crudui-node__footer"><Controls controls={vm.controls} /></div>{/if
}</div>
