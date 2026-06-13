/**
 * useConditional Hook
 *
 * Hook for handling conditional display logic
 * Supports display_switch, display_target, and element.all_of
 */

import { useCallback } from 'react';
import { parseCondition, evaluateCondition } from '@form-spec/validator/legacy';
import type { PathContext } from '@form-spec/validator/legacy';
import type {
  FormData,
  FormValue,
  UseConditionalReturn,
  ConditionalContext,
  AllOfCondition,
  AllOfResult,
} from '../types';
import { useFormContext } from '../context/FormContext';
import { getValueByPath, parsePathString } from '../utils/path';
import { hasDisplayTargetConditionMaps } from './legacyDisplay';

// Legacy Legacy conditional-display ports (single home: legacyDisplay.ts).
// display_switch condition EXPRESSIONS stay on the validator's
// parseCondition/evaluateCondition below — never re-implement them.
export {
  applyDisplaySwitchTransform,
  resolveDisplayTargetParts,
  hasDisplayTargetConditionMaps,
  legacyWrapperClassName,
  legacyWrapperStyle,
  minifyJs,
  genDisplayToken,
  displayTokenForSeed,
} from './legacyDisplay';

/**
 * useConditional hook options
 */
interface UseConditionalOptions {
  /** Current field path */
  path: string;
}

/**
 * useConditional hook
 */
export function useConditional({ path: _path }: UseConditionalOptions): UseConditionalReturn {
  const { spec, data } = useFormContext();

  /**
   * Check if field should be visible
   */
  const isVisible = useCallback(
    (fieldPath: string): boolean => {
      const pathSegments = parsePathString(fieldPath);
      const fieldSpec = getFieldSpecByPath(spec.properties, pathSegments);

      if (!fieldSpec) return true;

      // Check display_switch condition (string expression form only — the
      // legacy map form controls SIBLING presentation via the spec
      // transform, never this field's own visibility)
      if (fieldSpec.display_switch) {
        if (typeof fieldSpec.display_switch !== 'string') {
          return true;
        }
        const context: ConditionalContext = {
          path: fieldPath,
          data,
        };

        return evaluateDisplaySwitch(fieldSpec.display_switch, context);
      }

      // Check display_target condition — truthy-target semantics apply only
      // WITHOUT legacy condition maps; with maps, presentation is owned by
      // resolveDisplayTargetParts (reference: wrapper stays in the DOM)
      if (
        fieldSpec.display_target &&
        !hasDisplayTargetConditionMaps(fieldSpec as Record<string, unknown>)
      ) {
        const targetValue = getValueByPath(data, fieldSpec.display_target);
        return Boolean(targetValue);
      }

      // Check element.all_of conditions
      if (fieldSpec.element?.all_of) {
        const result = evaluateAllOfInternal(fieldSpec.element.all_of, data);
        return result.met;
      }

      return true;
    },
    [spec, data]
  );

  /**
   * Evaluate display_switch condition
   */
  const evaluateDisplaySwitch = useCallback(
    (condition: string, context: ConditionalContext): boolean => {
      try {
        const ast = parseCondition(condition);
        const pathContext: PathContext = {
          currentPath: parsePathString(context.path),
          formData: context.data as Record<string, unknown>,
        };

        return evaluateCondition(ast, pathContext, 'CURRENT');
      } catch {
        // If parsing fails, default to visible
        return true;
      }
    },
    []
  );

  /**
   * Evaluate display_target condition
   */
  const evaluateDisplayTarget = useCallback(
    (targetField: string, currentValue: FormValue): boolean => {
      const targetValue = getValueByPath(data, targetField);

      // Check if target field value matches current value
      if (currentValue !== undefined) {
        return targetValue === currentValue;
      }

      // Default: visible if target has truthy value
      return Boolean(targetValue);
    },
    [data]
  );

  /**
   * Evaluate element.all_of conditions
   */
  const evaluateAllOf = useCallback(
    (conditions: AllOfCondition): AllOfResult => {
      return evaluateAllOfInternal(conditions, data);
    },
    [data]
  );

  return {
    isVisible,
    evaluateDisplaySwitch,
    evaluateDisplayTarget,
    evaluateAllOf,
  };
}

/**
 * Pure all_of evaluation — exported for wrapper builders (FormGroup) that
 * need it outside the hook.
 */
export function evaluateAllOfInternal(conditions: AllOfCondition, data: FormData): AllOfResult {
  const conditionEntries = Object.entries(conditions.conditions);

  const allMet = conditionEntries.every(([fieldName, expected]) => {
    const actualValue = getValueByPath(data, fieldName);

    // If expected is an array, check if actual is in the array (OR condition)
    if (Array.isArray(expected)) {
      return expected.some((exp) => compareValues(actualValue, exp));
    }

    return compareValues(actualValue, expected);
  });

  if (allMet) {
    return {
      met: true,
      style: conditions.inline,
      className: conditions.class,
    };
  }

  return {
    met: false,
    style: conditions.not?.inline,
    className: conditions.not?.class,
  };
}

/**
 * Compare two values for equality
 */
function compareValues(actual: FormValue, expected: FormValue): boolean {
  // Handle null/undefined
  if (actual === null || actual === undefined) {
    return expected === null || expected === undefined || expected === '';
  }

  // String comparison (handles numeric strings)
  if (typeof actual === 'string' || typeof expected === 'string') {
    return String(actual) === String(expected);
  }

  // Direct comparison
  return actual === expected;
}

/**
 * Internal field spec type for conditional checking
 */
interface ConditionalFieldSpec {
  /** string = condition expression; boolean = unconditional; object = legacy
   *  sibling-presentation map (handled by applyDisplaySwitchTransform) */
  display_switch?: string | boolean | Record<string, unknown>;
  display_target?: string;
  display_target_condition_style?: Record<string, string>;
  display_target_condition_class?: Record<string, string>;
  element?: {
    all_of?: AllOfCondition;
  };
  properties?: Record<string, ConditionalFieldSpec>;
}

/**
 * Get field spec by path
 */
function getFieldSpecByPath(
  properties: Record<string, unknown>,
  pathSegments: string[]
): ConditionalFieldSpec | null {
  let current = properties;
  let fieldSpec: ConditionalFieldSpec | null = null;

  for (let i = 0; i < pathSegments.length; i++) {
    const segment = pathSegments[i]!;

    // Skip numeric indices and unique keys
    if (/^\d+$/.test(segment) || /^__[a-z0-9]{13}__$/.test(segment)) {
      continue;
    }

    fieldSpec = (current[segment] as ConditionalFieldSpec) ?? null;

    if (!fieldSpec) {
      return null;
    }

    const nestedProperties = fieldSpec.properties as Record<string, unknown> | undefined;
    if (nestedProperties && i < pathSegments.length - 1) {
      current = nestedProperties;
    }
  }

  return fieldSpec;
}

/**
 * Standalone function to check visibility without hook
 */
export function checkFieldVisibility(
  spec: Record<string, unknown>,
  path: string,
  data: FormData
): boolean {
  const pathSegments = parsePathString(path);
  const properties = (spec.properties ?? {}) as Record<string, unknown>;
  const fieldSpec = getFieldSpecByPath(properties, pathSegments);

  if (!fieldSpec) return true;

  // Check display_switch (string expression form only — map form is the
  // legacy sibling-presentation switch and never hides this field)
  const displaySwitch = fieldSpec.display_switch as unknown;
  if (displaySwitch) {
    if (typeof displaySwitch !== 'string') {
      return true;
    }
    try {
      const ast = parseCondition(displaySwitch);
      const context: PathContext = {
        currentPath: pathSegments,
        formData: data as Record<string, unknown>,
      };
      return evaluateCondition(ast, context, 'CURRENT');
    } catch {
      return true;
    }
  }

  // Check display_target — truthy-target semantics only WITHOUT legacy
  // condition maps (with maps the wrapper stays visible in the DOM and
  // resolveDisplayTargetParts owns the style/class)
  const displayTarget = fieldSpec.display_target as string | undefined;
  if (displayTarget && !hasDisplayTargetConditionMaps(fieldSpec as Record<string, unknown>)) {
    const targetValue = getValueByPath(data, displayTarget);
    return Boolean(targetValue);
  }

  // Check element.all_of
  const element = fieldSpec.element as { all_of?: AllOfCondition } | undefined;
  if (element?.all_of) {
    const result = evaluateAllOfInternal(element.all_of, data);
    return result.met;
  }

  return true;
}

export default useConditional;
