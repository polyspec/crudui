/**
 * Path Resolution Module
 *
 * Handles resolution of:
 * - Relative paths (., .., ...)
 * - Absolute paths
 * - Array wildcards (*)
 * - Array indices
 */

import {
  PathNode,
  PathContext,
  WildcardStrategy,
  ASTNode,
  BinaryNode,
  UnaryNode,
  InNode,
  TernaryNode,
} from '../types';

// ============================================================================
// Path Resolution
// ============================================================================

/**
 * Resolve a path node to an array of absolute path segments
 */
export function resolvePathSegments(
  pathNode: PathNode,
  context: PathContext
): string[] {
  const { currentPath } = context;
  const { relative, levelsUp, segments } = pathNode;

  let basePath: string[];

  if (relative) {
    // Remove current field name and go up 'levelsUp' levels
    // . = 0 levels up (sibling)
    // .. = 1 level up (parent's sibling)
    // ... = 2 levels up (grandparent's sibling)
    const levelsToRemove = levelsUp + 1;
    basePath = currentPath.slice(0, Math.max(0, currentPath.length - levelsToRemove));
  } else {
    // Absolute path starts from root
    basePath = [];
  }

  // Add path segments
  for (const segment of segments) {
    if (segment.type === 'identifier') {
      basePath.push(segment.value);
    } else if (segment.type === 'index') {
      basePath.push(String(segment.value));
    } else if (segment.type === 'wildcard') {
      basePath.push('*');
    }
  }

  return basePath;
}

/**
 * Get value by path from data object
 */
export function getValueByPath(
  data: Record<string, unknown>,
  path: string[]
): unknown {
  let current: unknown = data;

  for (const segment of path) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Set value by path in data object
 */
export function setValueByPath(
  data: Record<string, unknown>,
  path: string[],
  value: unknown
): void {
  let current: Record<string, unknown> = data;

  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i]!;
    if (!(segment in current)) {
      // Create object or array based on next segment
      const nextSegment = path[i + 1];
      current[segment] = /^\d+$/.test(nextSegment ?? '') ? [] : {};
    }
    current = current[segment] as Record<string, unknown>;
  }

  const lastSegment = path[path.length - 1];
  if (lastSegment !== undefined) {
    current[lastSegment] = value;
  }
}

/**
 * Extract current array index from path
 */
export function extractCurrentIndex(path: string[]): number | null {
  // Find the last numeric segment in the path
  for (let i = path.length - 1; i >= 0; i--) {
    const segment = path[i];
    if (segment !== undefined && /^\d+$/.test(segment)) {
      return parseInt(segment, 10);
    }
  }
  return null;
}

/**
 * Find the array path and remaining path after wildcard
 */
function findWildcardPosition(path: string[]): {
  arrayPath: string[];
  remainingPath: string[];
  wildcardIndex: number;
} | null {
  const wildcardIndex = path.indexOf('*');
  if (wildcardIndex === -1) {
    return null;
  }

  return {
    arrayPath: path.slice(0, wildcardIndex),
    remainingPath: path.slice(wildcardIndex + 1),
    wildcardIndex,
  };
}

/**
 * Resolve path with wildcard to multiple concrete values
 */
export function resolveWildcardPath(
  path: string[],
  formData: Record<string, unknown>,
  currentIndex?: number
): { path: string[]; value: unknown }[] {
  const wildcardInfo = findWildcardPosition(path);

  if (!wildcardInfo) {
    // No wildcard, return single value
    return [{ path, value: getValueByPath(formData, path) }];
  }

  const { arrayPath, remainingPath } = wildcardInfo;
  const arrayData = getValueByPath(formData, arrayPath);

  // Handle object data (e.g., from multiple: "only" pattern)
  // Treat the object as if accessing properties directly without index
  if (arrayData !== null && typeof arrayData === 'object' && !Array.isArray(arrayData)) {
    // For objects, skip the wildcard index and access remaining path directly
    const concretePath = [...arrayPath, ...remainingPath];
    // Recursively resolve any remaining wildcards
    const resolved = resolveWildcardPath(concretePath, formData);
    return resolved;
  }

  if (!Array.isArray(arrayData)) {
    return [];
  }

  const results: { path: string[]; value: unknown }[] = [];

  // If currentIndex is provided and path matches current array context
  if (currentIndex !== undefined) {
    const concretePath = [
      ...arrayPath,
      String(currentIndex),
      ...remainingPath,
    ];
    // Recursively resolve any remaining wildcards
    const resolved = resolveWildcardPath(concretePath, formData);
    results.push(...resolved);
  } else {
    // Resolve for all array indices
    for (let i = 0; i < arrayData.length; i++) {
      const concretePath = [...arrayPath, String(i), ...remainingPath];
      // Recursively resolve any remaining wildcards
      const resolved = resolveWildcardPath(concretePath, formData);
      results.push(...resolved);
    }
  }

  return results;
}

/**
 * Check if path contains a wildcard
 */
export function hasWildcard(path: string[]): boolean {
  return path.includes('*');
}

/**
 * Replace wildcard with current index in path
 */
export function replaceWildcardWithIndex(
  path: string[],
  currentPath: string[]
): string[] {
  const result: string[] = [];
  let currentArrayIndex = 0;

  // Find array indices in current path
  const arrayIndices: number[] = [];
  for (const segment of currentPath) {
    if (/^\d+$/.test(segment)) {
      arrayIndices.push(parseInt(segment, 10));
    }
  }

  for (const segment of path) {
    if (segment === '*') {
      // Use the corresponding array index from current path
      const index = arrayIndices[currentArrayIndex];
      if (index !== undefined) {
        result.push(String(index));
        currentArrayIndex++;
      } else {
        // No matching index, keep wildcard for later resolution
        result.push('*');
      }
    } else {
      result.push(segment);
    }
  }

  return result;
}

// ============================================================================
// Condition Evaluation
// ============================================================================

/**
 * Evaluate an AST node with the given context
 */
export function evaluateCondition(
  node: ASTNode,
  context: PathContext,
  wildcardStrategy: WildcardStrategy = 'CURRENT'
): boolean {
  switch (node.type) {
    case 'Binary':
      return evaluateBinary(node, context, wildcardStrategy);
    case 'Unary':
      return evaluateUnary(node, context, wildcardStrategy);
    case 'In':
      return evaluateIn(node, context, wildcardStrategy);
    case 'Group':
      return evaluateCondition(node.expression, context, wildcardStrategy);
    case 'Ternary':
      // For ternary in boolean context, evaluate and convert result to boolean
      return Boolean(evaluateTernary(node, context, wildcardStrategy));
    case 'Path':
    case 'Literal':
      // Truthy check for standalone values
      return Boolean(resolveValue(node, context, wildcardStrategy));
    default:
      return false;
  }
}

/**
 * Evaluate an AST node and return the actual value (not just boolean)
 * This is used for ternary expressions that return values like numbers
 * For non-ternary expressions (conditions), returns boolean
 */
export function evaluateExpressionValue(
  node: ASTNode,
  context: PathContext,
  wildcardStrategy: WildcardStrategy = 'CURRENT'
): unknown {
  switch (node.type) {
    case 'Ternary':
      // Ternary expressions return their actual evaluated value
      return evaluateTernary(node, context, wildcardStrategy);
    case 'Group':
      // For grouped expressions, check if inner is ternary
      return evaluateExpressionValue(node.expression, context, wildcardStrategy);
    case 'Binary':
    case 'Unary':
    case 'In':
    case 'Path':
    case 'Literal':
      // All other expressions return boolean (for conditions like ".field == 1" or ".field")
      return evaluateCondition(node, context, wildcardStrategy);
    default:
      return undefined;
  }
}

/**
 * Resolve a ternary branch value - returns the actual value of the node
 * Used by ternary evaluation to get the raw value of trueValue/falseValue
 */
function resolveTernaryBranchValue(
  node: ASTNode,
  context: PathContext,
  wildcardStrategy: WildcardStrategy
): unknown {
  switch (node.type) {
    case 'Ternary':
      // Nested ternary
      return evaluateTernary(node, context, wildcardStrategy);
    case 'Group':
      return resolveTernaryBranchValue(node.expression, context, wildcardStrategy);
    case 'Literal':
      return node.value;
    case 'Path':
      return resolveValue(node, context, wildcardStrategy);
    case 'Binary':
      return evaluateBinary(node, context, wildcardStrategy);
    case 'Unary':
      return evaluateUnary(node, context, wildcardStrategy);
    case 'In':
      return evaluateIn(node, context, wildcardStrategy);
    default:
      return undefined;
  }
}

/**
 * Evaluate a ternary expression and return the actual value
 */
function evaluateTernary(
  node: TernaryNode,
  context: PathContext,
  wildcardStrategy: WildcardStrategy
): unknown {
  const conditionResult = evaluateCondition(node.condition, context, wildcardStrategy);
  if (conditionResult) {
    return resolveTernaryBranchValue(node.trueValue, context, wildcardStrategy);
  } else {
    return resolveTernaryBranchValue(node.falseValue, context, wildcardStrategy);
  }
}

function evaluateBinary(
  node: BinaryNode,
  context: PathContext,
  wildcardStrategy: WildcardStrategy
): boolean {
  const { operator, left, right } = node;

  // Short-circuit evaluation for logical operators
  if (operator === '&&') {
    return (
      evaluateCondition(left, context, wildcardStrategy) &&
      evaluateCondition(right, context, wildcardStrategy)
    );
  }

  if (operator === '||') {
    return (
      evaluateCondition(left, context, wildcardStrategy) ||
      evaluateCondition(right, context, wildcardStrategy)
    );
  }

  // Comparison operators
  const leftValue = resolveValue(left, context, wildcardStrategy);
  const rightValue = resolveValue(right, context, wildcardStrategy);

  // Handle array of values from wildcard resolution
  if (Array.isArray(leftValue)) {
    return evaluateWithStrategy(
      leftValue,
      (lv) => compare(lv, rightValue, operator),
      wildcardStrategy
    );
  }

  return compare(leftValue, rightValue, operator);
}

function evaluateUnary(
  node: UnaryNode,
  context: PathContext,
  wildcardStrategy: WildcardStrategy
): boolean {
  if (node.operator === '!') {
    return !evaluateCondition(node.operand, context, wildcardStrategy);
  }
  return false;
}

function evaluateIn(
  node: InNode,
  context: PathContext,
  wildcardStrategy: WildcardStrategy
): boolean {
  const value = resolveValue(node.value, context, wildcardStrategy);
  const list = node.list.map((item) =>
    resolveValue(item, context, wildcardStrategy)
  );

  // Handle array of values from wildcard resolution
  if (Array.isArray(value)) {
    const check = (v: unknown) => {
      const included = list.some((item) => looseEquals(v, item));
      return node.negated ? !included : included;
    };
    return evaluateWithStrategy(value, check, wildcardStrategy);
  }

  const included = list.some((item) => looseEquals(value, item));
  return node.negated ? !included : included;
}

function evaluateWithStrategy(
  values: unknown[],
  predicate: (value: unknown) => boolean,
  strategy: WildcardStrategy
): boolean {
  switch (strategy) {
    case 'ANY':
      return values.some(predicate);
    case 'ALL':
      return values.every(predicate);
    case 'NONE':
      return values.every((v) => !predicate(v));
    case 'CURRENT':
      // Should not reach here if properly resolved
      return values.length > 0 ? predicate(values[0]) : false;
    default:
      return false;
  }
}

/**
 * Resolve an AST node to its value
 */
function resolveValue(
  node: ASTNode,
  context: PathContext,
  wildcardStrategy: WildcardStrategy
): unknown {
  switch (node.type) {
    case 'Literal':
      return node.value;

    case 'Path': {
      let resolvedPath = resolvePathSegments(node, context);

      // Handle wildcard in path
      if (hasWildcard(resolvedPath)) {
        if (wildcardStrategy === 'CURRENT') {
          // Replace wildcards with current indices
          resolvedPath = replaceWildcardWithIndex(
            resolvedPath,
            context.currentPath
          );
        }

        if (hasWildcard(resolvedPath)) {
          // Still has wildcards, resolve to array of values
          const resolved = resolveWildcardPath(
            resolvedPath,
            context.formData as Record<string, unknown>
          );
          return resolved.map((r) => r.value);
        }
      }

      return getValueByPath(
        context.formData as Record<string, unknown>,
        resolvedPath
      );
    }

    case 'Group':
      return evaluateCondition(node.expression, context, wildcardStrategy);

    default:
      return undefined;
  }
}

/**
 * Compare two values with the given operator
 */
function compare(
  left: unknown,
  right: unknown,
  operator: BinaryNode['operator']
): boolean {
  switch (operator) {
    case '==':
      return looseEquals(left, right);
    case '!=':
      return !looseEquals(left, right);
    case '>':
      return toNumber(left) > toNumber(right);
    case '>=':
      return toNumber(left) >= toNumber(right);
    case '<':
      return toNumber(left) < toNumber(right);
    case '<=':
      return toNumber(left) <= toNumber(right);
    default:
      return false;
  }
}

/**
 * Loose equality comparison (like JavaScript ==)
 * Handles string/number comparisons
 */
function looseEquals(a: unknown, b: unknown): boolean {
  // Same type comparison
  if (typeof a === typeof b) {
    return a === b;
  }

  // null/undefined comparison
  if (a === null || a === undefined) {
    return b === null || b === undefined;
  }
  if (b === null || b === undefined) {
    return false;
  }

  // String/Number comparison
  const aStr = String(a);
  const bStr = String(b);

  // Try numeric comparison if both can be numbers
  const aNum = Number(a);
  const bNum = Number(b);

  if (!isNaN(aNum) && !isNaN(bNum)) {
    return aNum === bNum;
  }

  return aStr === bStr;
}

/**
 * Convert value to number for comparison
 */
function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const num = parseFloat(value);
    return isNaN(num) ? 0 : num;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return 0;
}

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Parse a path string into segments
 */
export function parsePathString(pathString: string): string[] {
  if (!pathString) {
    return [];
  }
  return pathString.split('.').filter((s) => s.length > 0);
}

/**
 * Convert path segments to path string
 * Formats numeric indices and unique keys with bracket notation
 */
export function pathToString(path: string[]): string {
  if (path.length === 0) return '';

  return path.reduce((result, segment, index) => {
    // Check if segment is numeric or unique key (__xxxx__ format)
    if (/^\d+$/.test(segment) || /^__[a-z0-9]+__$/.test(segment)) {
      return `${result}[${segment}]`;
    }

    // First segment
    if (index === 0) {
      return segment;
    }

    // Use dot notation
    return `${result}.${segment}`;
  }, '');
}

/**
 * Get parent path
 */
export function getParentPath(path: string[]): string[] {
  return path.slice(0, -1);
}

/**
 * Get field name from path
 */
export function getFieldName(path: string[]): string {
  return path[path.length - 1] ?? '';
}

/**
 * Check if path is a child of parent path
 */
export function isChildPath(childPath: string[], parentPath: string[]): boolean {
  if (childPath.length <= parentPath.length) {
    return false;
  }

  for (let i = 0; i < parentPath.length; i++) {
    if (childPath[i] !== parentPath[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Get relative path from parent to child
 */
export function getRelativePath(
  childPath: string[],
  parentPath: string[]
): string[] {
  if (!isChildPath(childPath, parentPath)) {
    return childPath;
  }

  return childPath.slice(parentPath.length);
}
