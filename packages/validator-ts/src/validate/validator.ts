/**
 * CRUDUI form validator (reference) — SPEC §2 G5→§3→§2 G1.
 *
 * The third pass of the CRUDUI pipeline. It consumes a CRUDUI field model (the
 * `validate`/`design`/`behavior`/`options` role slots) AFTER the compose pass
 * has expanded `$ref`/`$patch` into a single spec. It does NOT touch the legacy
 * `Validator` (R7 parallel run) and it does NOT re-implement the rule
 * semantics or the expression engine — it CALLS the existing rule registry
 * (rules/index) and the existing expression engine (parser/ConditionParser,
 * parser/PathResolver). The only CRUDUI-new logic here is: (a) reading the
 * `validate` slot instead of the legacy `rules` key, (b) evaluating a rule value
 * that is an expression OR a condition map (G1 — the condition is the value's
 * expression, never a separate `if`/`when` key), and (c) dropping the legacy
 * `display_switch`/`display_target` visibility gates (G1 forbids those meta
 * keys; visibility-driven requiredness is expressed as `required: '<expr>'`).
 *
 * Pipeline (SPEC):
 *   1. compose — `composeSpec`/`composeProperties` (compose/) is run by the
 *      caller (`validate`) BEFORE this engine. An unresolved `$ref` throws a
 *      `ComposeLoadError` there (never `valid:true`).
 *   2. field traversal — recurse `properties`; group nesting, `multiple` arrays
 *      (items.i), object-key `multiple` (sorted keys, items.__uid__).
 *   3. validate-slot evaluation — per field, walk the `validate` slot in
 *      declaration order; for each rule, evaluate its value (expression /
 *      condition map → effective param); skip when the result is false/null;
 *      otherwise run the rule function. `type:number` runs an implicit `number`
 *      rule first when no explicit `number` rule is present.
 *   4. error collection — first error per field stops that field; collect into
 *      a flat `ValidationError[]`; `valid = errors.length === 0`.
 */

import type {
  ValidationError,
  ValidationResult,
  ValidationContext,
  PathContext,
  MessagesSpec,
} from '../types';
import { getRule } from '../rules/index';
import {
  parseCondition,
  isConditionExpression,
} from '../parser/ConditionParser';
import {
  evaluateCondition,
  evaluateExpressionValue,
  pathToString,
  getFieldName,
} from '../parser/PathResolver';

// ---------------------------------------------------------------------------
// Rule-class tables (identical to legacy — single source of truth re-declared so
// the CRUDUI engine never imports legacy private state, R7 isolation).
// ---------------------------------------------------------------------------

/**
 * Rules that apply to the whole array for a `multiple` field (the rest apply to
 * each element). VALIDATION-RULES §array-level.
 */
export const ARRAY_LEVEL_RULES = ['required', 'unique', 'mincount', 'maxcount'];

/**
 * Rules whose param is a field reference (relative path / filter condition) — it
 * is preserved verbatim and NOT evaluated as a condition expression. PATH-
 * REFERENCE-RULES.
 */
export const PATH_REFERENCE_RULES = ['equalTo', 'notEqual', 'unique'];

/**
 * Rules whose string param is a literal value, never a condition expression. An
 * `accept` param like `.jpg` would otherwise be misread as a relative field
 * reference. LITERAL-PARAM-RULES.
 */
export const LITERAL_PARAM_RULES = ['accept'];

/**
 * `match`/`pattern` carry a regex string preserved verbatim (it is not a
 * condition expression). SPEC §10: a regex exists only as a `match` argument.
 */
export const REGEX_PARAM_RULES = ['match', 'pattern'];

/**
 * Membership rules whose param is the allowed-value SET (an array, comma string,
 * or a static value→label map, SPEC §2 G3). The param is data, NOT a
 * condition map — an object param here is the value→label map (key = option
 * value, value = display label), so it must be kept verbatim and never evaluated
 * key-by-key as expressions. The rule's own flatten reads keys for a value→label
 * map (the label, possibly a LangMap or null, is display-only).
 */
export const MEMBERSHIP_PARAM_RULES = ['in'];

// ---------------------------------------------------------------------------
// CRUDUI field shape (the subset this engine reads from a composed CRUDUI field).
// ---------------------------------------------------------------------------

/** A CRUDUI field after compose: a plain object with the role slots. */
type ComposedField = Record<string, unknown>;

/**
 * Normalize a polymorphic `validate` slot to a rule map. `false` → no rules;
 * `true`/`{}` → no rules (the default-on slot carries no sub-rules); an object →
 * the rule map itself. Returns `undefined` when there is nothing to run.
 */
function normalizeValidateSlot(
  slot: unknown
): Record<string, unknown> | undefined {
  if (slot === false || slot === true || slot === undefined || slot === null) {
    return undefined;
  }
  if (typeof slot === 'object' && !Array.isArray(slot)) {
    return slot as Record<string, unknown>;
  }
  return undefined;
}

/** Read the per-field custom messages (CRUDUI keeps the legacy `messages` map). */
function fieldMessages(field: ComposedField): MessagesSpec | undefined {
  const m = field.messages;
  if (m && typeof m === 'object' && !Array.isArray(m)) {
    return m as MessagesSpec;
  }
  return undefined;
}

/**
 * CRUDUI validator. Construct from a COMPOSED CRUDUI spec (composition keys already
 * eliminated). `validate` (index) does the compose pass first.
 */
export class Validator {
  private readonly properties: Record<string, ComposedField>;

  /**
   * @param composedSpec a composed CRUDUI root spec — a group with `properties`
   *        (already free of `$ref`/`$patch`).
   */
  constructor(composedSpec: ComposedField) {
    const props = composedSpec.properties;
    this.properties =
      props && typeof props === 'object' && !Array.isArray(props)
        ? (props as Record<string, ComposedField>)
        : {};
  }

  /** Validate `data` against the composed CRUDUI spec. */
  validate(data: Record<string, unknown>): ValidationResult {
    const errors: ValidationError[] = [];
    this.validateProperties(this.properties, data ?? {}, [], data ?? {}, errors);
    return { valid: errors.length === 0, errors };
  }

  // =========================================================================
  // Field traversal (SPEC §3; legacy Validator.validateProperties skeleton).
  // =========================================================================

  private validateProperties(
    properties: Record<string, ComposedField>,
    data: Record<string, unknown>,
    currentPath: string[],
    allData: Record<string, unknown>,
    errors: ValidationError[]
  ): void {
    for (const [propertyKey, field] of Object.entries(properties)) {
      if (!field || typeof field !== 'object') {
        continue;
      }
      const fieldName = propertyKey;
      const isMultiple = this.isMultiple(field);
      const fieldPath = [...currentPath, fieldName];
      const fieldValue = data?.[fieldName];

      // NOTE: no display_switch / display_target gate (G1 — those meta keys do
      // not exist in CRUDUI; visibility-conditioned requiredness is required:'<expr>').

      const childProps = this.childProperties(field);

      if (field.type === 'group' && childProps) {
        const isArrayMultiple = isMultiple && Array.isArray(fieldValue);
        const isObjectMultiple =
          isMultiple &&
          fieldValue !== null &&
          typeof fieldValue === 'object' &&
          !Array.isArray(fieldValue);

        if (isArrayMultiple) {
          // Repeatable group: each index is items.i.
          for (let i = 0; i < (fieldValue as unknown[]).length; i++) {
            const itemData = (fieldValue as unknown[])[i] as Record<
              string,
              unknown
            >;
            this.validateProperties(
              childProps,
              itemData ?? {},
              [...fieldPath, String(i)],
              allData,
              errors
            );
          }
          this.validateFieldRules(field, fieldValue, fieldPath, allData, errors);
        } else if (isObjectMultiple) {
          // Object-key multiple: deterministic sorted-key traversal so the
          // first reported error matches Go/Rust/PHP (their maps carry no
          // insertion order). Keys (items.__uid__) are preserved.
          const objectValue = fieldValue as Record<
            string,
            Record<string, unknown>
          >;
          for (const key of Object.keys(objectValue).sort()) {
            this.validateProperties(
              childProps,
              objectValue[key] ?? {},
              [...fieldPath, key],
              allData,
              errors
            );
          }
          this.validateFieldRules(field, fieldValue, fieldPath, allData, errors);
        } else if (!isMultiple) {
          // Single nested group.
          this.validateProperties(
            childProps,
            (fieldValue as Record<string, unknown>) ?? {},
            fieldPath,
            allData,
            errors
          );
          this.validateFieldRules(field, fieldValue, fieldPath, allData, errors);
        }
        // multiple set but data shape mismatched: skip (legacy parity).
      } else if (isMultiple && fieldValue !== null && typeof fieldValue === 'object') {
        // Non-group multiple field: array-level rules on the whole array, the
        // rest on each element.
        this.validateMultipleFieldRules(
          field,
          fieldValue as unknown[] | Record<string, unknown>,
          fieldPath,
          allData,
          errors
        );
      } else {
        this.validateFieldRules(field, fieldValue, fieldPath, allData, errors);
      }
    }
  }

  /** Whether a CRUDUI field repeats (`multiple: true` or `multiple: { ... }`). */
  private isMultiple(field: ComposedField): boolean {
    const m = field.multiple;
    return m === true || (m !== null && typeof m === 'object' && !Array.isArray(m));
  }

  /** The child field map of a group (composed, plain object), or undefined. */
  private childProperties(
    field: ComposedField
  ): Record<string, ComposedField> | undefined {
    const props = field.properties;
    if (props && typeof props === 'object' && !Array.isArray(props)) {
      return props as Record<string, ComposedField>;
    }
    return undefined;
  }

  // =========================================================================
  // validate-slot evaluation (SPEC §3 slots.validate).
  // =========================================================================

  /** Array-level + element rules for a non-group `multiple` field. */
  private validateMultipleFieldRules(
    field: ComposedField,
    values: unknown[] | Record<string, unknown>,
    fieldPath: string[],
    allData: Record<string, unknown>,
    errors: ValidationError[]
  ): void {
    const rules = normalizeValidateSlot(field.validate);
    const messages = fieldMessages(field);

    // 1. Array-level rules in declaration order; first error wins for the field.
    if (rules) {
      const context: PathContext = { currentPath: fieldPath, formData: allData };
      for (const [ruleName, ruleValue] of Object.entries(rules)) {
        if (!ARRAY_LEVEL_RULES.includes(ruleName)) {
          continue;
        }
        const error = this.runRule(
          ruleName,
          ruleValue,
          values,
          context,
          field,
          messages
        );
        if (error) {
          errors.push({
            path: pathToString(fieldPath),
            field: getFieldName(fieldPath),
            rule: ruleName,
            message: error,
            value: values,
          });
          return;
        }
      }
    }

    // 2. Element-level rules per index (items.i).
    const entries = Array.isArray(values) ? values.map((value, i) => [String(i), value] as const)
      : Object.keys(values).sort().map(key => [key, values[key]] as const);
    for (const [key, value] of entries) {
      this.validateElementRules(
        field,
        value,
        [...fieldPath, key],
        allData,
        errors
      );
    }
  }

  /** Element-level rules for one element of a `multiple` field (no array-level). */
  private validateElementRules(
    field: ComposedField,
    value: unknown,
    itemPath: string[],
    allData: Record<string, unknown>,
    errors: ValidationError[]
  ): void {
    const context: PathContext = { currentPath: itemPath, formData: allData };
    const messages = fieldMessages(field);
    const rules = normalizeValidateSlot(field.validate);

    if (this.runImplicitNumber(field, rules, value, context, messages, itemPath, errors)) {
      return;
    }
    if (!rules) {
      return;
    }
    for (const [ruleName, ruleValue] of Object.entries(rules)) {
      if (ARRAY_LEVEL_RULES.includes(ruleName)) {
        continue;
      }
      const error = this.runRule(ruleName, ruleValue, value, context, field, messages);
      if (error) {
        errors.push({
          path: pathToString(itemPath),
          field: getFieldName(itemPath),
          rule: ruleName,
          message: error,
          value,
        });
        break;
      }
    }
  }

  /** All rules for a single (scalar or group-as-whole) field. */
  private validateFieldRules(
    field: ComposedField,
    value: unknown,
    fieldPath: string[],
    allData: Record<string, unknown>,
    errors: ValidationError[]
  ): void {
    const context: PathContext = { currentPath: fieldPath, formData: allData };
    const messages = fieldMessages(field);
    const rules = normalizeValidateSlot(field.validate);

    if (this.runImplicitNumber(field, rules, value, context, messages, fieldPath, errors)) {
      return;
    }
    if (!rules) {
      return;
    }
    for (const [ruleName, ruleValue] of Object.entries(rules)) {
      const error = this.runRule(ruleName, ruleValue, value, context, field, messages);
      if (error) {
        errors.push({
          path: pathToString(fieldPath),
          field: getFieldName(fieldPath),
          rule: ruleName,
          message: error,
          value,
        });
        break;
      }
    }
  }

  /**
   * `type:number` runs an implicit `number` rule before everything else when no
   * explicit `number` rule is declared (VALIDATION-RULES §2 — reported as rule
   * `number`). Returns true when it pushed an error (caller must stop the field).
   */
  private runImplicitNumber(
    field: ComposedField,
    rules: Record<string, unknown> | undefined,
    value: unknown,
    context: PathContext,
    messages: MessagesSpec | undefined,
    path: string[],
    errors: ValidationError[]
  ): boolean {
    if (field.type !== 'number') {
      return false;
    }
    if (rules && 'number' in rules) {
      return false;
    }
    const error = this.runRule('number', true, value, context, field, messages);
    if (error) {
      errors.push({
        path: pathToString(path),
        field: getFieldName(path),
        rule: 'number',
        message: error,
        value,
      });
      return true;
    }
    return false;
  }

  // =========================================================================
  // Conditional rule value (G1) — expression / condition map → effective param.
  // =========================================================================

  /**
   * Run one rule: evaluate its (possibly conditional) value to an effective
   * param, skip when the result disables the rule (false/null), else call the
   * existing rule function. Returns the error message or null.
   */
  private runRule(
    ruleName: string,
    ruleValue: unknown,
    value: unknown,
    context: PathContext,
    field: ComposedField,
    messages: MessagesSpec | undefined
  ): string | null {
    const effectiveParam = this.resolveRuleValue(ruleName, ruleValue, context);

    // A false/null effective param disables the rule (VALIDATION-RULES common §3).
    if (effectiveParam === false || effectiveParam === null) {
      return null;
    }

    const ruleDefinition = getRule(ruleName);
    if (!ruleDefinition) {
      // Unregistered rule: no error (VALIDATION-RULES common §4).
      return null;
    }

    const validationContext: ValidationContext = {
      path: pathToString(context.currentPath),
      field: getFieldName(context.currentPath),
      value,
      allData: context.formData as Record<string, unknown>,
      // The rule reads `spec.type`/`spec.messages` only; pass the CRUDUI field as-is.
      spec: field as { type: string },
      pathSegments: context.currentPath,
      ruleParam: effectiveParam,
      messages,
      ruleName,
    };

    return ruleDefinition.validate(validationContext);
  }

  /**
   * Resolve a rule value to the effective param (G1).
   *
   * The value is `Evaluated<V>` = literal | Expression(string) | ConditionMap.
   *   - Path-reference / literal-param / regex rules keep their string param
   *     verbatim (SPEC §10) — never evaluated as a condition.
   *   - A ConditionMap (plain object whose keys are expressions) is evaluated in
   *     declaration order; the first truthy key's value is the param; otherwise
   *     the `true` key; otherwise null (disabled).
   *   - A string is evaluated as a ternary (value-returning branch) or a plain
   *     condition expression.
   *   - Anything else is a literal param.
   */
  private resolveRuleValue(
    ruleName: string,
    ruleValue: unknown,
    context: PathContext
  ): unknown {
    // Verbatim-param rules: never evaluate (field reference / literal / regex /
    // membership set). A membership param object is a value→label map (G3), not
    // a condition map, so it is preserved verbatim for the rule's own flatten.
    if (
      PATH_REFERENCE_RULES.includes(ruleName) ||
      LITERAL_PARAM_RULES.includes(ruleName) ||
      REGEX_PARAM_RULES.includes(ruleName) ||
      MEMBERSHIP_PARAM_RULES.includes(ruleName)
    ) {
      return ruleValue;
    }

    // ConditionMap: a plain object of expression→value, declaration-ordered.
    if (
      ruleValue !== null &&
      typeof ruleValue === 'object' &&
      !Array.isArray(ruleValue)
    ) {
      return this.resolveConditionMap(
        ruleValue as Record<string, unknown>,
        context
      );
    }

    // String: ternary value-return or plain condition.
    if (typeof ruleValue === 'string') {
      const ternary = this.tryEvaluateTernary(ruleValue, context);
      if (ternary.handled) {
        return ternary.value;
      }
      if (isConditionExpression(ruleValue) && !/\?[^:]*:/.test(ruleValue)) {
        return this.evaluateExpressionValue(ruleValue, context);
      }
    }

    // Literal param (number, boolean, array such as rangelength/range).
    return ruleValue;
  }

  /**
   * Evaluate a ConditionMap (EXPRESSION-GRAMMAR §8): walk keys in declaration
   * order, return the value of the first key whose expression is truthy; if none
   * match, return the `true` (always-true default) key's value; if absent, null
   * (rule disabled). The map is a thin repeated-engine-call wrapper, not a new
   * parser; a single ternary is its shorthand (handled in resolveRuleValue).
   */
  private resolveConditionMap(
    map: Record<string, unknown>,
    context: PathContext
  ): unknown {
    for (const key of Object.keys(map)) {
      if (key === 'true') {
        continue; // The default is the fallback, evaluated last.
      }
      if (this.evaluateCondition(key, context)) {
        return map[key];
      }
    }
    if ('true' in map) {
      return map.true;
    }
    return null;
  }

  /**
   * Try to read a string param as a value-returning ternary
   * (`cond ? a : b`). Returns `{ handled:false }` when the string is not a
   * ternary or its condition part is not a parseable condition (so a regex such
   * as `^https?://...` containing `?...:` is NOT mistaken for a ternary).
   */
  private tryEvaluateTernary(
    expression: string,
    context: PathContext
  ): { handled: boolean; value?: unknown } {
    const questionPos = findTernaryOperator(expression, '?');
    if (questionPos === -1) {
      return { handled: false };
    }
    const colonPos = findTernaryOperator(expression, ':', questionPos + 1);
    if (colonPos === -1) {
      return { handled: false };
    }
    const condition = expression.slice(0, questionPos).trim();
    if (!isConditionExpression(condition)) {
      return { handled: false };
    }
    try {
      parseCondition(condition);
    } catch {
      return { handled: false };
    }
    const conditionResult = this.evaluateCondition(condition, context);
    const branch = conditionResult
      ? expression.slice(questionPos + 1, colonPos).trim()
      : expression.slice(colonPos + 1).trim();

    if (/\?[^:]*:/.test(branch)) {
      const nested = this.tryEvaluateTernary(branch, context);
      if (nested.handled) {
        return nested;
      }
    }
    return { handled: true, value: parseTernaryBranchValue(branch) };
  }

  private evaluateCondition(expression: string, context: PathContext): boolean {
    try {
      return evaluateCondition(parseCondition(expression), context, 'CURRENT');
    } catch {
      return false;
    }
  }

  private evaluateExpressionValue(
    expression: string,
    context: PathContext
  ): unknown {
    try {
      return evaluateExpressionValue(parseCondition(expression), context, 'CURRENT');
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Ternary helpers (string-split, regex-safe). Self-contained so the CRUDUI engine
// does not import legacy private functions (R7 isolation); semantics are identical
// to the legacy Validator helpers and proven equal by the shared fixtures.
// ---------------------------------------------------------------------------

/**
 * Position of a top-level ternary `?`/`:` respecting quotes, parens, brackets
 * and nested ternaries (PHP ConditionParser::findTernaryOperator parity).
 */
function findTernaryOperator(
  expression: string,
  operator: '?' | ':',
  startPos = 0
): number {
  let depth = 0;
  let inQuote = false;
  let quoteChar = '';
  let ternaryDepth = 0;

  for (let i = startPos; i < expression.length; i++) {
    const char = expression[i]!;
    if ((char === '"' || char === "'") && !inQuote) {
      inQuote = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuote) {
      inQuote = false;
      quoteChar = '';
    }
    if (!inQuote) {
      if (char === '(' || char === '[') {
        depth++;
      } else if (char === ')' || char === ']') {
        depth--;
      }
      if (char === '?' && depth === 0) {
        if (operator === '?') {
          return i;
        }
        ternaryDepth++;
      } else if (char === ':' && depth === 0) {
        if (operator === ':') {
          if (ternaryDepth === 0) {
            return i;
          }
          ternaryDepth--;
        }
      }
    }
  }
  return -1;
}

/**
 * Parse a ternary branch string into a typed value (PHP
 * ConditionParser::parseValue parity for scalars). A regex-pattern branch
 * survives as a raw string.
 */
function parseTernaryBranchValue(raw: string): unknown {
  const value = raw.trim();
  const quoted = value.match(/^["'](.*)["']$/s);
  if (quoted) {
    return quoted[1];
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (value === 'null') {
    return null;
  }
  if (value !== '' && !isNaN(Number(value))) {
    return value.includes('.') ? parseFloat(value) : parseInt(value, 10);
  }
  return value;
}
