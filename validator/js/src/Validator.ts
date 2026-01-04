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
} from './types';

import {
  getRule,
  registerRule,
} from './rules/index';

import {
  parseCondition,
  isConditionExpression,
} from './parser/ConditionParser';

import {
  evaluateCondition,
  evaluateExpressionValue,
  parsePathString,
  pathToString,
  getFieldName,
} from './parser/PathResolver';

/**
 * Validator class for form-spec validation
 */
export class Validator {
  private spec: Spec;
  private customRules: Map<string, RuleDefinition> = new Map();

  /**
   * Create a new Validator instance
   * @param spec - Form specification
   */
  constructor(spec: Spec) {
    this.spec = spec;
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

    // Validate each rule
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

    this.customRules.set(name, definition);

    // Also register globally for other validators
    registerRule(name, definition);
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
    for (const [fieldName, fieldSpec] of Object.entries(properties)) {
      const fieldPath = [...currentPath, fieldName];
      const fieldValue = data?.[fieldName];

      // Check if field should be validated (display_switch condition)
      if (fieldSpec.display_switch) {
        const context: PathContext = {
          currentPath: fieldPath,
          formData: allData,
        };

        const shouldDisplay = this.evaluateDisplayCondition(
          fieldSpec.display_switch,
          context
        );

        if (!shouldDisplay) {
          continue; // Skip validation for hidden fields
        }
      }

      // Handle group type (nested or array)
      if (fieldSpec.type === 'group' && fieldSpec.properties) {
        // Check if it's a true array (multiple: true with array data)
        const isArrayMultiple = fieldSpec.multiple === true && Array.isArray(fieldValue);
        // Check if it's "only" mode (multiple: "only" with object data)
        const isOnlyMultiple = fieldSpec.multiple === 'only' &&
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
        } else if (!fieldSpec.multiple) {
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
   * Validate rules for a single field
   */
  private validateFieldRules(
    fieldSpec: FieldSpec,
    value: unknown,
    fieldPath: string[],
    allData: Record<string, unknown>,
    errors: ValidationError[]
  ): void {
    if (!fieldSpec.rules) {
      return;
    }

    const context: PathContext = {
      currentPath: fieldPath,
      formData: allData,
    };

    const messages = fieldSpec.messages;

    // For number type fields, implicitly run number validation first
    // if there's no explicit number rule (to catch invalid numbers before min/max)
    if (fieldSpec.type === 'number' && !('number' in fieldSpec.rules)) {
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
    // Rules that use path references directly (not evaluated as conditions)
    // These rules need the raw path string to resolve values themselves
    const PATH_REFERENCE_RULES = ['equalTo', 'notEqual'];

    // Check for conditional rules
    let effectiveParam = ruleParam;

    // Only evaluate condition expressions for rules that don't use path references
    if (isConditionExpression(ruleParam) && !PATH_REFERENCE_RULES.includes(ruleName)) {
      // Parse and evaluate expression (returns actual value for ternary, boolean for conditions)
      const expressionResult = this.evaluateExpressionValue(ruleParam, context);
      effectiveParam = expressionResult;

      // For required rule, if condition is false, skip validation
      if (ruleName === 'required' && !expressionResult) {
        return null;
      }
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
    };

    // Run validation
    return ruleDefinition.validate(validationContext);
  }

  /**
   * Evaluate a condition expression (returns boolean)
   */
  private evaluateCondition(expression: string, context: PathContext): boolean {
    try {
      const ast = parseCondition(expression);
      return evaluateCondition(ast, context, 'CURRENT');
    } catch {
      // If parsing fails, treat as false
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
    } catch {
      // If parsing fails, return false
      return false;
    }
  }

  /**
   * Evaluate display_switch condition
   */
  private evaluateDisplayCondition(
    condition: string,
    context: PathContext
  ): boolean {
    return this.evaluateCondition(condition, context);
  }

  /**
   * Get field specification by path
   */
  private getFieldSpec(pathSegments: string[]): FieldSpec | null {
    let current: Record<string, FieldSpec> = this.spec.properties;
    let fieldSpec: FieldSpec | null = null;

    for (let i = 0; i < pathSegments.length; i++) {
      const segment = pathSegments[i]!;

      // Skip numeric indices (array elements)
      if (/^\d+$/.test(segment)) {
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
 */
export function createValidator(spec: Spec): Validator {
  return new Validator(spec);
}

export default Validator;
