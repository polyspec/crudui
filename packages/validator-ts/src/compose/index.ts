/**
 * CRUDUI composition engine (reference) — SPEC §5, G5.
 *
 * The parser's first pass: expand `$ref` (base inheritance) then `$patch`
 * (add/remove/replace + deep-path set) into a single, composition-free spec,
 * BEFORE the field layer / validation / render. Unresolved composition is a LOAD
 * ERROR (`ComposeLoadError`) — never `valid:true` (the legacy LargeForm.yml:873
 * bug). CRUDUI-NEW only: this never touches the legacy model or loader (R7 parallel run).
 */

export { composeProperties, composeSpec } from './compose';
export type { ComposeOptions } from './compose';
export { resolveRef } from './ref';
export { applyPatch } from './patch';
export type { Patch } from './patch';
export { MemoryLoader } from './loader';
export type { FileLoader, LoadedDoc } from './loader';
export { ComposeLoadError } from './errors';
export type { ComposeErrorCode } from './errors';
