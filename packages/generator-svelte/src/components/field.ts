/** CRUDUI Svelte node helpers: class and style values for the node grammar (no markup). */

import type { NodeVM } from '@polyspec/crudui-generator-core';

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

/** Context key of the node errors that `FormFields` provides to every `Node`. */
export const NODE_ERRORS = Symbol('crudui-node-errors');

/** Reads the error texts of the nodes that have errors (form-runtime.md, "Complete form"). */
export type NodeErrorsSource = () => ReadonlyMap<NodeVM, readonly string[]> | undefined;
