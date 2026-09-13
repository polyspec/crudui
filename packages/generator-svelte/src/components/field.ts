/** CRUDUI Svelte node helpers: class and style values for the node grammar (no markup). */

import type { NodeVM } from '@crudui/generator-core';

/** Join non-empty class names. */
export function classes(...parts: Array<string | undefined | false>): string {
  return parts.filter((part): part is string => typeof part === 'string' && part !== '').join(' ');
}

/** Root style: the node style plus the sticky depth of a sticky row. */
export function rootStyle(vm: NodeVM): string | undefined {
  const style = [vm.style, vm.sticky ? `--crudui-sticky-depth: ${vm.stickyDepth ?? 0}` : undefined]
    .filter(Boolean)
    .join('; ');
  return style || undefined;
}
