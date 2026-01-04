/**
 * Path Utilities
 *
 * Functions for working with form field paths
 */

import type { FormValue, FormData, UniqueKey } from '../types';

/**
 * Parse path string to segments array
 * Handles formats: "a.b.c", "a[0].b", "a[__key__].b"
 */
export function parsePathString(path: string): string[] {
  if (!path) return [];

  const segments: string[] = [];
  let current = '';
  let inBracket = false;

  for (let i = 0; i < path.length; i++) {
    const char = path[i];

    if (char === '[' && !inBracket) {
      if (current) {
        segments.push(current);
        current = '';
      }
      inBracket = true;
    } else if (char === ']' && inBracket) {
      if (current) {
        segments.push(current);
        current = '';
      }
      inBracket = false;
    } else if (char === '.' && !inBracket) {
      if (current) {
        segments.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    segments.push(current);
  }

  return segments;
}

/**
 * Convert path segments to string
 */
export function pathToString(segments: string[]): string {
  if (segments.length === 0) return '';

  return segments.reduce((result, segment, index) => {
    // Check if segment is numeric or unique key
    if (/^\d+$/.test(segment) || /^__[a-z0-9]{13}__$/.test(segment)) {
      return `${result}[${segment}]`;
    }

    // First segment or after bracket
    if (index === 0) {
      return segment;
    }

    // Use dot notation
    return `${result}.${segment}`;
  }, '');
}

/**
 * Get value at path from object
 */
export function getValueByPath(obj: FormData, path: string): FormValue {
  const segments = parsePathString(path);

  let current: unknown = obj;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }

  return current as FormValue;
}

/**
 * Set value at path in object (immutably)
 */
export function setValueByPath(obj: FormData, path: string, value: FormValue): FormData {
  const segments = parsePathString(path);

  if (segments.length === 0) {
    return obj;
  }

  const result = { ...obj };
  let current: Record<string, unknown> = result;

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]!;
    const nextSegment = segments[i + 1]!;

    // Determine if next value should be array or object
    const isNextArray = /^\d+$/.test(nextSegment);

    if (current[segment] === undefined || current[segment] === null) {
      current[segment] = isNextArray ? [] : {};
    } else if (Array.isArray(current[segment])) {
      current[segment] = [...(current[segment] as unknown[])];
    } else if (typeof current[segment] === 'object') {
      current[segment] = { ...(current[segment] as Record<string, unknown>) };
    }

    current = current[segment] as Record<string, unknown>;
  }

  const lastSegment = segments[segments.length - 1]!;
  current[lastSegment] = value;

  return result;
}

/**
 * Delete value at path from object
 */
export function deleteValueByPath(obj: FormData, path: string): FormData {
  const segments = parsePathString(path);

  if (segments.length === 0) {
    return obj;
  }

  const result = { ...obj };
  let current: Record<string, unknown> = result;

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]!;

    if (current[segment] === undefined || current[segment] === null) {
      return result;
    }

    if (Array.isArray(current[segment])) {
      current[segment] = [...(current[segment] as unknown[])];
    } else if (typeof current[segment] === 'object') {
      current[segment] = { ...(current[segment] as Record<string, unknown>) };
    }

    current = current[segment] as Record<string, unknown>;
  }

  const lastSegment = segments[segments.length - 1]!;
  delete current[lastSegment];

  return result;
}

/**
 * Generate unique key for array items
 * Format: __[13 chars]__
 */
export function generateUniqueKey(): UniqueKey {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let key = '';

  for (let i = 0; i < 13; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `__${key}__` as UniqueKey;
}

/**
 * Check if string is a unique key
 */
export function isUniqueKey(value: string): value is UniqueKey {
  return /^__[a-z0-9]{13}__$/.test(value);
}

/**
 * Extract unique keys from path
 */
export function extractUniqueKeys(path: string): UniqueKey[] {
  const matches = path.match(/__[a-z0-9]{13}__/g);
  return (matches ?? []) as UniqueKey[];
}

/**
 * Get parent path
 */
export function getParentPath(path: string): string {
  const segments = parsePathString(path);
  return pathToString(segments.slice(0, -1));
}

/**
 * Get field name (last segment)
 */
export function getFieldName(path: string): string {
  const segments = parsePathString(path);
  return segments[segments.length - 1] ?? '';
}

/**
 * Join path segments
 */
export function joinPath(...parts: (string | number)[]): string {
  const segments: string[] = [];

  for (const part of parts) {
    if (typeof part === 'number') {
      segments.push(String(part));
    } else if (part) {
      segments.push(...parsePathString(part));
    }
  }

  return pathToString(segments);
}

/**
 * Check if path is child of another path
 */
export function isChildPath(child: string, parent: string): boolean {
  const childSegments = parsePathString(child);
  const parentSegments = parsePathString(parent);

  if (childSegments.length <= parentSegments.length) {
    return false;
  }

  return parentSegments.every((segment, index) => childSegments[index] === segment);
}

/**
 * Convert unique keys to indices for server submission
 */
export function keysToIndices(data: FormData): FormData {
  const result: FormData = {};

  function processValue(value: FormValue, path: string[] = []): void {
    if (value === null || value === undefined) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        processValue(item, [...path, String(index)]);
      });
    } else if (typeof value === 'object' && !(value instanceof File)) {
      const entries = Object.entries(value as Record<string, FormValue>);

      // Check if object keys are unique keys
      const hasUniqueKeys = entries.some(([key]) => isUniqueKey(key));

      if (hasUniqueKeys) {
        // Convert unique keys to indices
        entries.forEach(([key, val], index) => {
          if (isUniqueKey(key)) {
            processValue(val, [...path, String(index)]);
          } else {
            processValue(val, [...path, key]);
          }
        });
      } else {
        // Regular object
        entries.forEach(([key, val]) => {
          processValue(val, [...path, key]);
        });
      }
    } else {
      // Primitive value
      const pathStr = pathToString(path);
      setValueByPath(result, pathStr, value);
    }
  }

  processValue(data);
  return result;
}
