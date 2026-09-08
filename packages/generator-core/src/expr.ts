/** Evaluate form visibility and appearance using the shared expression engine. */
import {
  parseCondition,
  isConditionExpression,
  evaluateCondition,
  evaluateExpressionValue,
  type PathContext,
} from '@crudui/validator';

/**
 * A CRUDUI `Evaluated<V>` value as seen at render: a literal, an Expression string,
 * or a declaration-ordered ConditionMap (plain object). Mirrors
 * validator-ts/src/types.ts:73.
 */
export type Evaluated<V = unknown> = V | string | Record<string, unknown>;

/** Build the engine PathContext for a field at `currentPath` over `formData`. */
export function makeContext(
  currentPath: string[],
  formData: Record<string, unknown>
): PathContext {
  return { currentPath, formData };
}

function evalConditionBool(expression: string, context: PathContext): boolean {
  try {
    return evaluateCondition(parseCondition(expression), context, 'CURRENT');
  } catch {
    return false;
  }
}

function evalExpressionValue(expression: string, context: PathContext): unknown {
  try {
    return evaluateExpressionValue(parseCondition(expression), context, 'CURRENT');
  } catch {
    return false;
  }
}

/** Evaluate a complete ternary AST; other strings remain literal values. */
function tryEvaluateTernary(
  expression: string,
  context: PathContext
): { handled: boolean; value?: unknown } {
  try {
    const node = parseCondition(expression);
    if (node.type !== 'Ternary') return { handled: false };
    return { handled: true, value: evaluateExpressionValue(node, context) };
  } catch {
    return { handled: false };
  }
}

/**
 * Evaluate a ConditionMap (expressions.md §8): walk keys in declaration
 * order, return the value of the first truthy key; else the `true` default key;
 * else null.
 */
function resolveConditionMap(
  map: Record<string, unknown>,
  context: PathContext
): unknown {
  for (const key of Object.keys(map)) {
    if (key === 'true') continue;
    if (evalConditionBool(key, context)) return map[key];
  }
  if ('true' in map) return map.true;
  return null;
}

// ---------------------------------------------------------------------------
// public dispatchers (the only surfaces the renderer calls)
// ---------------------------------------------------------------------------

/**
 * `design.show` → boolean. Absent = always shown (true). Expression evaluated as
 * a condition; condition map resolved; failures fall back to the validator
 * safety net (false). Ported from validator.ts evaluateCondition path.
 */
export function evalShow(
  value: unknown,
  context: PathContext
): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return Boolean(resolveConditionMap(value as Record<string, unknown>, context));
  }
  if (typeof value === 'string') {
    return evalConditionBool(value, context);
  }
  return Boolean(value);
}

/**
 * `design.class` / `design.style` → string. Mirrors validator.ts
 * resolveRuleValue: object → condition map; string → ternary value-return, else
 * a bare condition expression returns its evaluated value, else the literal.
 * A non-string literal is returned as-is (then string-cast by the caller).
 */
export function evalAppearance(
  value: unknown,
  context: PathContext
): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object' && !Array.isArray(value)) {
    const resolved = resolveConditionMap(
      value as Record<string, unknown>,
      context
    );
    return resolved === null || resolved === undefined ? '' : String(resolved);
  }
  if (typeof value === 'string') {
    const ternary = tryEvaluateTernary(value, context);
    if (ternary.handled) {
      return ternary.value === null || ternary.value === undefined
        ? ''
        : String(ternary.value);
    }
    // A bare condition expression (no ternary) returns its evaluated value.
    if (isConditionExpression(value) && !/\?[^:]*:/.test(value)) {
      const v = evalExpressionValue(value, context);
      return v === null || v === undefined || v === false ? '' : String(v);
    }
    // Plain literal class/style string.
    return value;
  }
  return String(value);
}
