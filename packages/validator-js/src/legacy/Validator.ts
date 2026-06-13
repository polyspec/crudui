/**
 * Form Validator
 *
 * Core validation class for form-spec validation
 */

import {
  Spec,
  FieldSpec,
  MessagesSpec,
  ValidationResult,
  ValidationError,
  ValidationContext,
  RuleFn,
  RuleDefinition,
  PathContext,
  ValidatorOptions,
} from './types';

import {
  getRule,
} from '../rules/index';

import {
  parseCondition,
  isConditionExpression,
} from '../parser/ConditionParser';

import {
  evaluateCondition,
  evaluateExpressionValue,
  parsePathString,
  pathToString,
  getFieldName,
  resolveFieldReference,
} from '../parser/PathResolver';

/**
 * Rules that receive their raw param (path references / filter conditions)
 * instead of having string params pre-evaluated as condition expressions
 */
const PATH_REFERENCE_RULES = ['equalTo', 'notEqual', 'unique'];

/**
 * Rules whose string param is a literal value, never a condition expression.
 * An accept param such as ".jpg" or ".jpg,.png" starts with a dot and would
 * otherwise be misread as a relative field reference and the rule skipped.
 */
const LITERAL_PARAM_RULES = ['accept'];

/**
 * Find the position of a top-level ternary operator ('?' or ':') in an
 * expression, respecting quotes, parentheses, brackets and nested ternaries
 * (PHP ConditionParser::findTernaryOperator parity)
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

    // Handle quotes
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
 * Parse a ternary branch value string into a typed value
 * (PHP ConditionParser::parseValue parity for scalar values)
 */
function parseTernaryBranchValue(raw: string): unknown {
  const value = raw.trim();

  // Quoted strings
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

  // Raw string (e.g., a regex pattern branch)
  return value;
}

/**
 * Rules that apply to the array as a whole for `multiple: true` fields.
 * All other rules apply to each array element individually.
 */
const ARRAY_LEVEL_RULES = ['required', 'unique', 'mincount', 'maxcount'];

/**
 * Validator class for form-spec validation
 */
export class Validator {
  private spec: Spec;
  private options: ValidatorOptions;
  private customRules: Map<string, RuleDefinition> = new Map();

  /**
   * Create a new Validator instance
   * @param spec - Form specification
   * @param options - Validator options (optional)
   */
  constructor(spec: Spec, options: ValidatorOptions = {}) {
    this.spec = spec;
    this.options = options;
  }

  /**
   * Validate all form data against the spec
   * @param data - Form data to validate
   * @returns Validation result with errors array
   */
  validate(data: Record<string, unknown>): ValidationResult {
    const errors: ValidationError[] = [];

    // Validate all fields recursively
    this.validateProperties(
      this.spec.properties,
      data,
      [],
      data,
      errors
    );

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate a single field
   * @param path - Dot-separated path to the field
   * @param value - Field value to validate
   * @param allData - Complete form data for context
   * @returns Error message or null if valid
   */
  validateField(
    path: string,
    value: unknown,
    allData: Record<string, unknown>
  ): string | null {
    const pathSegments = parsePathString(path);
    const fieldSpec = this.getFieldSpec(pathSegments);

    if (!fieldSpec || !fieldSpec.rules) {
      return null;
    }

    const context: PathContext = {
      currentPath: pathSegments,
      formData: allData,
    };

    // Get messages from field spec
    const messages = fieldSpec.messages;

    // Validate each rule - return first error only
    for (const [ruleName, ruleParam] of Object.entries(fieldSpec.rules)) {
      const error = this.validateRule(
        ruleName,
        ruleParam,
        value,
        context,
        fieldSpec,
        messages
      );

      if (error) {
        return error;
      }
    }

    return null;
  }

  /**
   * Add a custom validation rule
   * @param name - Rule name
   * @param fn - Validation function
   */
  addRule(name: string, fn: RuleFn): void {
    const definition: RuleDefinition = {
      validate: fn,
      defaultMessage: 'Validation failed.',
    };

    // Instance-scoped only: never pollutes the global registry.
    // Use registerRule() from rules/index for explicit global registration.
    this.customRules.set(name, definition);
  }

  /**
   * Get the form specification
   */
  getSpec(): Spec {
    return this.spec;
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  /**
   * Validate all properties in a group
   */
  private validateProperties(
    properties: Record<string, FieldSpec>,
    data: Record<string, unknown>,
    currentPath: string[],
    allData: Record<string, unknown>,
    errors: ValidationError[]
  ): void {
    for (const [propertyKey, fieldSpec] of Object.entries(properties)) {
      // A "[]"-suffix key (e.g. "items[]") is legacy Limepie shorthand for a
      // multiple field. Strip the suffix for both the data lookup and the
      // path, and treat the field as multiple === true (PHP Validator.php and
      // client dist.validate.js parity). Without this the raw "items[]" key
      // misses the "items" data and validation is silently skipped.
      const isArraySuffix = propertyKey.endsWith('[]');
      const fieldName = isArraySuffix ? propertyKey.slice(0, -2) : propertyKey;
      const isMultiple = fieldSpec.multiple === true || isArraySuffix;

      const fieldPath = [...currentPath, fieldName];
      const fieldValue = data?.[fieldName];

      // Check display_switch / display_target visibility conditions
      if (!this.shouldValidateField(fieldSpec, fieldPath, allData)) {
        continue; // Skip validation for hidden fields
      }

      // Handle group type (nested or array)
      if (fieldSpec.type === 'group' && fieldSpec.properties) {
        // Check if it's a true array (multiple with array data)
        const isArrayMultiple = isMultiple && Array.isArray(fieldValue);
        // Check if it's "only" mode (multiple: "only" with object data)
        const isOnlyMultiple = fieldSpec.multiple === 'only' &&
          fieldValue !== null &&
          typeof fieldValue === 'object' &&
          !Array.isArray(fieldValue);
        // Check if it's object-based multiple (multiple with object data using unique keys)
        const isObjectMultiple = isMultiple &&
          fieldValue !== null &&
          typeof fieldValue === 'object' &&
          !Array.isArray(fieldValue);

        if (isArrayMultiple) {
          // Repeatable group (array of objects)
          for (let i = 0; i < (fieldValue as unknown[]).length; i++) {
            const itemPath = [...fieldPath, String(i)];
            const itemData = (fieldValue as unknown[])[i] as Record<string, unknown>;

            this.validateProperties(
              fieldSpec.properties,
              itemData ?? {},
              itemPath,
              allData,
              errors
            );
          }

          // Validate array-level rules
          this.validateFieldRules(
            fieldSpec,
            fieldValue,
            fieldPath,
            allData,
            errors
          );
        } else if (isObjectMultiple) {
          // Repeatable group stored as object with unique keys
          const objectValue = fieldValue as Record<string, Record<string, unknown>>;
          for (const [key, itemData] of Object.entries(objectValue)) {
            const itemPath = [...fieldPath, key];

            this.validateProperties(
              fieldSpec.properties,
              itemData ?? {},
              itemPath,
              allData,
              errors
            );
          }

          // Validate group-level rules
          this.validateFieldRules(
            fieldSpec,
            fieldValue,
            fieldPath,
            allData,
            errors
          );
        } else if (isOnlyMultiple) {
          // Single object treated like array for wildcards (multiple: "only")
          // Validate nested properties directly without array index
          this.validateProperties(
            fieldSpec.properties,
            fieldValue as Record<string, unknown>,
            fieldPath,
            allData,
            errors
          );

          // Validate group-level rules
          this.validateFieldRules(
            fieldSpec,
            fieldValue,
            fieldPath,
            allData,
            errors
          );
        } else if (!isMultiple && fieldSpec.multiple !== 'only') {
          // Single nested group
          this.validateProperties(
            fieldSpec.properties,
            (fieldValue as Record<string, unknown>) ?? {},
            fieldPath,
            allData,
            errors
          );

          // Validate group-level rules
          this.validateFieldRules(
            fieldSpec,
            fieldValue,
            fieldPath,
            allData,
            errors
          );
        }
        // Note: if multiple is set but data format doesn't match, skip validation
      } else if (isMultiple && Array.isArray(fieldValue)) {
        // Regular field with multiple values (e.g., multiple text inputs):
        // array-level rules apply to the whole array, the remaining rules
        // apply to each element
        this.validateMultipleFieldRules(
          fieldSpec,
          fieldValue,
          fieldPath,
          allData,
          errors
        );
      } else {
        // Regular field
        this.validateFieldRules(
          fieldSpec,
          fieldValue,
          fieldPath,
          allData,
          errors
        );
      }
    }
  }

  /**
   * Check display_switch / display_target conditions for a field.
   * Returns false when the field is hidden (validation must be skipped).
   */
  private shouldValidateField(
    fieldSpec: FieldSpec,
    fieldPath: string[],
    allData: Record<string, unknown>
  ): boolean {
    const isGroup = fieldSpec.type === 'group';

    // display_switch: condition string or boolean
    const displaySwitch = fieldSpec.display_switch;
    if (displaySwitch !== undefined && displaySwitch !== null) {
      if (displaySwitch === false) {
        return false; // Always hidden
      }
      if (typeof displaySwitch === 'string' && displaySwitch !== '') {
        const context: PathContext = {
          currentPath: fieldPath,
          formData: allData,
          groupNode: isGroup,
        };
        if (!this.evaluateCondition(displaySwitch, context)) {
          return false;
        }
      }
      // displaySwitch === true: always visible
    }

    // display_target: hidden when the target field value is empty
    // ('0' and 0 count as present - PHP Validator::shouldValidateField parity)
    const displayTarget = fieldSpec.display_target;
    if (typeof displayTarget === 'string' && displayTarget !== '') {
      const targetValue = resolveFieldReference(displayTarget, {
        currentPath: fieldPath,
        formData: allData,
        groupNode: isGroup,
      });

      const isHidden =
        targetValue === null ||
        targetValue === undefined ||
        targetValue === false ||
        targetValue === '' ||
        (Array.isArray(targetValue) && targetValue.length === 0) ||
        (typeof targetValue === 'object' &&
          targetValue !== null &&
          !Array.isArray(targetValue) &&
          Object.keys(targetValue).length === 0);

      if (isHidden) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate a `multiple: true` non-group field whose value is an array.
   * Array-level rules (required/unique/mincount/maxcount) run against the
   * whole array; all other rules run against each element.
   */
  private validateMultipleFieldRules(
    fieldSpec: FieldSpec,
    values: unknown[],
    fieldPath: string[],
    allData: Record<string, unknown>,
    errors: ValidationError[]
  ): void {
    const messages = fieldSpec.messages;

    // 1. Array-level rules (in spec declaration order, first error wins)
    if (fieldSpec.rules) {
      const context: PathContext = {
        currentPath: fieldPath,
        formData: allData,
      };

      for (const [ruleName, ruleParam] of Object.entries(fieldSpec.rules)) {
        if (!ARRAY_LEVEL_RULES.includes(ruleName)) {
          continue;
        }

        const error = this.validateRule(
          ruleName,
          ruleParam,
          values,
          context,
          fieldSpec,
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
          return; // First error wins for this field
        }
      }
    }

    // 2. Item-level rules for each element
    for (let i = 0; i < values.length; i++) {
      const itemPath = [...fieldPath, String(i)];
      this.validateArrayItemRules(
        fieldSpec,
        values[i],
        itemPath,
        allData,
        errors
      );
    }
  }

  /**
   * Validate item-level rules for a single element of a multiple field.
   * Array-level rules are excluded.
   */
  private validateArrayItemRules(
    fieldSpec: FieldSpec,
    value: unknown,
    itemPath: string[],
    allData: Record<string, unknown>,
    errors: ValidationError[]
  ): void {
    const context: PathContext = {
      currentPath: itemPath,
      formData: allData,
    };
    const messages = fieldSpec.messages;

    // For number type fields, implicitly run number validation first
    if (
      fieldSpec.type === 'number' &&
      !(fieldSpec.rules && 'number' in fieldSpec.rules)
    ) {
      const error = this.validateRule(
        'number',
        true,
        value,
        context,
        fieldSpec,
        messages
      );

      if (error) {
        errors.push({
          path: pathToString(itemPath),
          field: getFieldName(itemPath),
          rule: 'number',
          message: error,
          value,
        });
        return;
      }
    }

    if (!fieldSpec.rules) {
      return;
    }

    for (const [ruleName, ruleParam] of Object.entries(fieldSpec.rules)) {
      if (ARRAY_LEVEL_RULES.includes(ruleName)) {
        continue;
      }

      const error = this.validateRule(
        ruleName,
        ruleParam,
        value,
        context,
        fieldSpec,
        messages
      );

      if (error) {
        errors.push({
          path: pathToString(itemPath),
          field: getFieldName(itemPath),
          rule: ruleName,
          message: error,
          value,
        });
        break; // Stop at first error for this item
      }
    }
  }

  /**
   * Validate rules for a single field
   */
  private validateFieldRules(
    fieldSpec: FieldSpec,
    value: unknown,
    fieldPath: string[],
    allData: Record<string, unknown>,
    errors: ValidationError[]
  ): void {
    const context: PathContext = {
      currentPath: fieldPath,
      formData: allData,
    };

    const messages = fieldSpec.messages;

    // For number type fields, implicitly run number validation first
    // if there's no explicit number rule (to catch invalid numbers before min/max).
    // This MUST run before the `!fieldSpec.rules` guard below — a number field
    // with no rules still gets the implicit number check (PHP Validator.php:290
    // and Go run the implicit number regardless of rules; JS must match, even
    // though legacy had no implicit number at all — intentional strengthening,
    // client must not be looser than server).
    if (
      fieldSpec.type === 'number' &&
      !(fieldSpec.rules && 'number' in fieldSpec.rules)
    ) {
      const error = this.validateRule(
        'number',
        true,
        value,
        context,
        fieldSpec,
        messages
      );

      if (error) {
        errors.push({
          path: pathToString(fieldPath),
          field: getFieldName(fieldPath),
          rule: 'number',
          message: error,
          value,
        });
        return; // Stop at first error
      }
    }

    if (!fieldSpec.rules) {
      return;
    }

    for (const [ruleName, ruleParam] of Object.entries(fieldSpec.rules)) {
      const error = this.validateRule(
        ruleName,
        ruleParam,
        value,
        context,
        fieldSpec,
        messages
      );

      if (error) {
        errors.push({
          path: pathToString(fieldPath),
          field: getFieldName(fieldPath),
          rule: ruleName,
          message: error,
          value,
        });

        // Stop at first error for this field (optional: can be changed)
        break;
      }
    }
  }

  /**
   * Validate a single rule
   */
  private validateRule(
    ruleName: string,
    ruleParam: unknown,
    value: unknown,
    context: PathContext,
    fieldSpec: FieldSpec,
    messages?: MessagesSpec
  ): string | null {
    // Check for conditional rules
    let effectiveParam = ruleParam;

    // Only evaluate condition expressions for rules that don't use path
    // references / filter conditions (those receive the raw string)
    if (
      typeof ruleParam === 'string' &&
      !PATH_REFERENCE_RULES.includes(ruleName) &&
      !LITERAL_PARAM_RULES.includes(ruleName)
    ) {
      // Ternary expressions are evaluated by string-splitting so that branch
      // values which are not parseable expressions (e.g., regex patterns for
      // the pattern/match rule) survive as raw strings.
      // A string only counts as a ternary when its condition part parses as
      // a real condition - "^https?://..." style regexes do not.
      const ternary = this.tryEvaluateTernary(ruleParam, context);

      if (ternary.handled) {
        effectiveParam = ternary.value;
      } else if (isConditionExpression(ruleParam) && !/\?[^:]*:/.test(ruleParam)) {
        // Plain (non-ternary) condition expression
        effectiveParam = this.evaluateExpressionValue(ruleParam, context);
      }
    }

    // A false/null param disables the rule
    // (covers literal `rule: false` and conditions that evaluate to false)
    if (effectiveParam === false || effectiveParam === null) {
      return null;
    }

    // Get rule definition
    const ruleDefinition =
      this.customRules.get(ruleName) ?? getRule(ruleName);

    if (!ruleDefinition) {
      // Unknown rule, skip
      return null;
    }

    // Create validation context
    const validationContext: ValidationContext = {
      path: pathToString(context.currentPath),
      field: getFieldName(context.currentPath),
      value,
      allData: context.formData as Record<string, unknown>,
      spec: fieldSpec,
      pathSegments: context.currentPath,
      ruleParam: effectiveParam,
      messages,
      ruleName,
    };

    // Run validation
    return ruleDefinition.validate(validationContext);
  }

  /**
   * Try to evaluate a string param as a ternary expression
   * (condition ? trueValue : falseValue).
   *
   * Returns { handled: false } when the string is not a ternary or its
   * condition part is not a parseable condition expression (so raw strings
   * like regex patterns containing "?...:" pass through untouched).
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

    // The condition part must look like a condition AND parse successfully -
    // otherwise this is not a ternary (e.g., "^https?://..." regex)
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

    // Nested ternary support
    if (/\?[^:]*:/.test(branch)) {
      const nested = this.tryEvaluateTernary(branch, context);
      if (nested.handled) {
        return nested;
      }
    }

    return { handled: true, value: parseTernaryBranchValue(branch) };
  }

  /**
   * Evaluate a condition expression (returns boolean)
   */
  private evaluateCondition(expression: string, context: PathContext): boolean {
    try {
      const ast = parseCondition(expression);
      return evaluateCondition(ast, context, 'CURRENT');
    } catch (error) {
      if (this.options.debug) {
        console.warn(
          `[Form-Spec] Failed to evaluate condition: "${expression}"`,
          `\n  Path: ${pathToString(context.currentPath)}`,
          `\n  Error:`,
          error
        );
      }
      return false;
    }
  }

  /**
   * Evaluate an expression and return its actual value
   * For ternary expressions, this returns the evaluated branch value
   * For conditions, this returns a boolean
   */
  private evaluateExpressionValue(expression: string, context: PathContext): unknown {
    try {
      const ast = parseCondition(expression);
      return evaluateExpressionValue(ast, context, 'CURRENT');
    } catch (error) {
      if (this.options.debug) {
        console.warn(
          `[Form-Spec] Failed to evaluate expression: "${expression}"`,
          `\n  Path: ${pathToString(context.currentPath)}`,
          `\n  Error:`,
          error
        );
      }
      return false;
    }
  }

  /**
   * Get field specification by path
   */
  private getFieldSpec(pathSegments: string[]): FieldSpec | null {
    let current: Record<string, FieldSpec> = this.spec.properties;
    let fieldSpec: FieldSpec | null = null;

    for (let i = 0; i < pathSegments.length; i++) {
      const segment = pathSegments[i]!;

      // Skip numeric indices (array elements) and unique keys (__xxxx__ format)
      if (/^\d+$/.test(segment) || /^__[a-z0-9]+__$/.test(segment)) {
        continue;
      }

      fieldSpec = current[segment] ?? null;

      if (!fieldSpec) {
        return null;
      }

      // If this field has nested properties and there are more segments
      if (fieldSpec.properties && i < pathSegments.length - 1) {
        current = fieldSpec.properties;
      }
    }

    return fieldSpec;
  }
}

/**
 * Create a new Validator instance
 * @param spec - Form specification
 * @param options - Validator options (optional)
 */
export function createValidator(spec: Spec, options?: ValidatorOptions): Validator {
  return new Validator(spec, options);
}

export default Validator;
