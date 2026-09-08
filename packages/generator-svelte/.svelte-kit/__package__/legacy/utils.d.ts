/**
 * Framework-independent path / data-attribute / uniqid helpers.
 * Ported from packages/generator-react/src/utils/{dataAttributes,path}.ts.
 */
/**
 * Generate Limepie-compatible uniqid. Format: __[13 hex chars]__ (same length
 * as PHP uniqid()). Deterministic monotonic counter so SSR is stable; the
 * parity normalizer masks the value (only token LENGTH is contractual).
 */
export declare function generateUniqid(): string;
/** Reset the uniqid counter (call between renders for stable ids). */
export declare function resetUniqid(): void;
/**
 * Convert dot notation path to bracket notation with optional key prefix.
 * "common.email" -> "common[email]"; with keyPrefix "product":
 * "basic.name" -> "product[basic][name]".
 */
export declare function toBracketNotationWithPrefix(path: string, keyPrefix?: string): string;
/**
 * Parse path string to segments array.
 * Handles "a.b.c", "a[0].b", "a[__key__].b".
 */
export declare function parsePathString(path: string): string[];
/** Get value at a dot/bracket path from an object. */
export declare function getValueByPath(obj: unknown, path: string): unknown;
//# sourceMappingURL=utils.d.ts.map