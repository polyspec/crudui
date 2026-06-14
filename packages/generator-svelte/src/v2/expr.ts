/**
 * v2 generator expression bridge (Svelte) — REUSE, do not reimplement.
 *
 * The condition parser (ConditionParser) and evaluator (PathResolver) are the
 * SAME surfaces the v2 validator consumes (validator-js/src/parser/*). This file
 * is a thin dispatcher that ports the validator's `resolveRuleValue` /
 * `resolveConditionMap` / `tryEvaluateTernary` patterns
 * (validator-js/src/v2/validate/validator.ts:519,543,578) so the generator
 * derives `design.show`/`design.class`/`design.style` from the SAME AST and the
 * SAME evaluation as the validator. One engine, two consumers — 4-language /
 * 3-framework idempotence is anchored on tests/fixtures/expr/cases.json, and the
 * Svelte rendering is bit-identical to React/Vue because all three call this.
 *
 * R7 isolation: this never imports v1 generator private state and never calls
 * `eval`. Parse/eval failures fall back to the validator's safety net
 * (false / null) — never throw out of render.
 */

// The SAME parser/evaluator surfaces the v2 validator consumes, imported through
// the validator's public package API — identical AST, identical evaluation. The
// generator never reimplements the engine.
import {
  parseCondition,
  isConditionExpression,
  evaluateCondition,
  evaluateExpressionValue,
  type PathContext,
} from '@form-spec/validator';

/**
 * A v2 `Evaluated<V>` value as seen at render: a literal, an Expression string,
 * or a declaration-ordered ConditionMap (plain object).
 */
export type Evaluated<V = unknown> = V | string | Record<string, unknown>;

/** Build the engine PathContext for a field at `currentPath` over `formData`. */
export function makeContext(
  currentPath: string[],
  formData: Record<string, unknown>
): PathContext {
  return { currentPath, formData };
}

// ---------------------------------------------------------------------------
// ternary helpers (string-split, regex-safe) — ported from validator.ts so the
// generator never mistakes a regex (`^https?://...?:...`) for a ternary.
// ---------------------------------------------------------------------------

/** Index of a top-level `?`/`:` operator (skips strings/brackets/parens). */
function findTernaryOperator(expr: string, op: '?' | ':', from = 0): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < expr.length; i++) {
    const ch = expr[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (depth === 0 && ch === op) return i;
  }
  return -1;
}

/** Parse a ternary branch literal: strip quotes, coerce number/bool/null. */
function parseTernaryBranchValue(branch: string): unknown {
  const s = branch.trim();
  if (
    (s.startsWith("'") && s.endsWith("'")) ||
    (s.startsWith('"') && s.endsWith('"'))
  ) {
    return s.slice(1, -1);
  }
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null') return null;
  if (s !== '' && !Number.isNaN(Number(s))) return Number(s);
  return s;
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

/** Try to read `cond ? a : b`; `{ handled:false }` when not a real ternary. */
function tryEvaluateTernary(
  expression: string,
  context: PathContext
): { handled: boolean; value?: unknown } {
  const q = findTernaryOperator(expression, '?');
  if (q === -1) return { handled: false };
  const c = findTernaryOperator(expression, ':', q + 1);
  if (c === -1) return { handled: false };
  const condition = expression.slice(0, q).trim();
  if (!isConditionExpression(condition)) return { handled: false };
  try {
    parseCondition(condition);
  } catch {
    return { handled: false };
  }
  const result = evalConditionBool(condition, context);
  const branch = result
    ? expression.slice(q + 1, c).trim()
    : expression.slice(c + 1).trim();
  if (/\?[^:]*:/.test(branch)) {
    const nested = tryEvaluateTernary(branch, context);
    if (nested.handled) return nested;
  }
  return { handled: true, value: parseTernaryBranchValue(branch) };
}

/**
 * Evaluate a ConditionMap (EXPRESSION-GRAMMAR §8): walk keys in declaration
 * order, return the value of the first truthy key; else the `true` default key;
 * else null. Exact port of validator.ts:519 resolveConditionMap.
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
