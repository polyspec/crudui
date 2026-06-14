/**
 * useConditional Hook Tests
 *
 * Tests for conditional display logic including display_switch, display_target, and all_of
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { render, screen } from '@testing-library/react';
import { useConditional, checkFieldVisibility } from '../legacy/hooks/useConditional';
import { FormContextProvider } from '../legacy/context/FormContext';
import { I18nContextProvider } from '../legacy/context/I18nContext';
import type { Spec } from '@crudui/validator/legacy';
import type { FormData, AllOfCondition } from '../legacy/types';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a wrapper component for testing hooks with context
 */
function createWrapper(spec: Spec, initialData: FormData = {}) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <I18nContextProvider language="en">
        <FormContextProvider spec={spec} initialData={initialData}>
          {children}
        </FormContextProvider>
      </I18nContextProvider>
    );
  };
}

// ============================================================================
// useConditional Hook Tests
// ============================================================================

describe('useConditional hook', () => {
  describe('return values', () => {
    it('should return all expected methods', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          test: { type: 'text', label: 'Test' },
        },
      };

      const { result } = renderHook(
        () => useConditional({ path: 'test' }),
        { wrapper: createWrapper(spec) }
      );

      expect(result.current.isVisible).toBeInstanceOf(Function);
      expect(result.current.evaluateDisplaySwitch).toBeInstanceOf(Function);
      expect(result.current.evaluateDisplayTarget).toBeInstanceOf(Function);
      expect(result.current.evaluateAllOf).toBeInstanceOf(Function);
    });
  });

  describe('isVisible', () => {
    it('should return true for field without conditions', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          name: { type: 'text', label: 'Name' },
        },
      };

      const { result } = renderHook(
        () => useConditional({ path: 'name' }),
        { wrapper: createWrapper(spec) }
      );

      expect(result.current.isVisible('name')).toBe(true);
    });

    it('should return true for non-existent field', () => {
      const spec: Spec = {
        type: 'group',
        properties: {},
      };

      const { result } = renderHook(
        () => useConditional({ path: 'unknown' }),
        { wrapper: createWrapper(spec) }
      );

      expect(result.current.isVisible('unknown')).toBe(true);
    });

    it('should evaluate display_switch condition correctly', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          type: { type: 'select', label: 'Type' },
          details: {
            type: 'text',
            label: 'Details',
            display_switch: 'type == "special"',
          },
        },
      };

      // When condition is not met
      const { result: result1 } = renderHook(
        () => useConditional({ path: 'details' }),
        { wrapper: createWrapper(spec, { type: 'normal' }) }
      );
      expect(result1.current.isVisible('details')).toBe(false);

      // When condition is met
      const { result: result2 } = renderHook(
        () => useConditional({ path: 'details' }),
        { wrapper: createWrapper(spec, { type: 'special' }) }
      );
      expect(result2.current.isVisible('details')).toBe(true);
    });

    it('should evaluate display_target condition correctly', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          showMore: { type: 'checkbox', label: 'Show More' },
          moreInfo: {
            type: 'text',
            label: 'More Info',
            display_target: 'showMore',
          },
        },
      };

      // When target is falsy
      const { result: result1 } = renderHook(
        () => useConditional({ path: 'moreInfo' }),
        { wrapper: createWrapper(spec, { showMore: false }) }
      );
      expect(result1.current.isVisible('moreInfo')).toBe(false);

      // When target is truthy
      const { result: result2 } = renderHook(
        () => useConditional({ path: 'moreInfo' }),
        { wrapper: createWrapper(spec, { showMore: true }) }
      );
      expect(result2.current.isVisible('moreInfo')).toBe(true);
    });
  });

  describe('evaluateDisplaySwitch', () => {
    it('should evaluate simple equality condition', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          status: { type: 'select', label: 'Status' },
        },
      };

      const { result } = renderHook(
        () => useConditional({ path: 'test' }),
        { wrapper: createWrapper(spec, { status: 'active' }) }
      );

      expect(
        result.current.evaluateDisplaySwitch('status == "active"', {
          path: 'test',
          data: { status: 'active' },
        })
      ).toBe(true);

      expect(
        result.current.evaluateDisplaySwitch('status == "inactive"', {
          path: 'test',
          data: { status: 'active' },
        })
      ).toBe(false);
    });

    it('should evaluate boolean conditions', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          enabled: { type: 'checkbox', label: 'Enabled' },
        },
      };

      const { result } = renderHook(
        () => useConditional({ path: 'test' }),
        { wrapper: createWrapper(spec, { enabled: true }) }
      );

      expect(
        result.current.evaluateDisplaySwitch('enabled == true', {
          path: 'test',
          data: { enabled: true },
        })
      ).toBe(true);

      expect(
        result.current.evaluateDisplaySwitch('enabled == false', {
          path: 'test',
          data: { enabled: true },
        })
      ).toBe(false);
    });

    it('should evaluate numeric comparisons', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          count: { type: 'number', label: 'Count' },
        },
      };

      const { result } = renderHook(
        () => useConditional({ path: 'test' }),
        { wrapper: createWrapper(spec, { count: 10 }) }
      );

      expect(
        result.current.evaluateDisplaySwitch('count >= 5', {
          path: 'test',
          data: { count: 10 },
        })
      ).toBe(true);

      expect(
        result.current.evaluateDisplaySwitch('count < 5', {
          path: 'test',
          data: { count: 10 },
        })
      ).toBe(false);
    });

    it('should evaluate AND conditions', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          a: { type: 'checkbox', label: 'A' },
          b: { type: 'checkbox', label: 'B' },
        },
      };

      const { result } = renderHook(
        () => useConditional({ path: 'test' }),
        { wrapper: createWrapper(spec, { a: true, b: true }) }
      );

      expect(
        result.current.evaluateDisplaySwitch('a == true && b == true', {
          path: 'test',
          data: { a: true, b: true },
        })
      ).toBe(true);

      expect(
        result.current.evaluateDisplaySwitch('a == true && b == true', {
          path: 'test',
          data: { a: true, b: false },
        })
      ).toBe(false);
    });

    it('should evaluate OR conditions', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          type: { type: 'select', label: 'Type' },
        },
      };

      const { result } = renderHook(
        () => useConditional({ path: 'test' }),
        { wrapper: createWrapper(spec, { type: 'a' }) }
      );

      expect(
        result.current.evaluateDisplaySwitch('type == "a" || type == "b"', {
          path: 'test',
          data: { type: 'a' },
        })
      ).toBe(true);

      expect(
        result.current.evaluateDisplaySwitch('type == "a" || type == "b"', {
          path: 'test',
          data: { type: 'c' },
        })
      ).toBe(false);
    });

    it('should return true for invalid expression (graceful fallback)', () => {
      const spec: Spec = {
        type: 'group',
        properties: {},
      };

      const { result } = renderHook(
        () => useConditional({ path: 'test' }),
        { wrapper: createWrapper(spec) }
      );

      expect(
        result.current.evaluateDisplaySwitch('invalid {{{{ syntax', {
          path: 'test',
          data: {},
        })
      ).toBe(true);
    });
  });

  describe('evaluateDisplayTarget', () => {
    it('should return true when target field has truthy value', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          enabled: { type: 'checkbox', label: 'Enabled' },
        },
      };

      const { result } = renderHook(
        () => useConditional({ path: 'test' }),
        { wrapper: createWrapper(spec, { enabled: true }) }
      );

      expect(result.current.evaluateDisplayTarget('enabled', undefined)).toBe(true);
    });

    it('should return false when target field has falsy value', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          enabled: { type: 'checkbox', label: 'Enabled' },
        },
      };

      const { result } = renderHook(
        () => useConditional({ path: 'test' }),
        { wrapper: createWrapper(spec, { enabled: false }) }
      );

      expect(result.current.evaluateDisplayTarget('enabled', undefined)).toBe(false);
    });

    it('should check specific value when provided', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          status: { type: 'select', label: 'Status' },
        },
      };

      const { result } = renderHook(
        () => useConditional({ path: 'test' }),
        { wrapper: createWrapper(spec, { status: 'active' }) }
      );

      expect(result.current.evaluateDisplayTarget('status', 'active')).toBe(true);
      expect(result.current.evaluateDisplayTarget('status', 'inactive')).toBe(false);
    });

    it('should handle empty string as falsy', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          name: { type: 'text', label: 'Name' },
        },
      };

      const { result } = renderHook(
        () => useConditional({ path: 'test' }),
        { wrapper: createWrapper(spec, { name: '' }) }
      );

      expect(result.current.evaluateDisplayTarget('name', undefined)).toBe(false);
    });

    it('should handle zero as falsy', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          count: { type: 'number', label: 'Count' },
        },
      };

      const { result } = renderHook(
        () => useConditional({ path: 'test' }),
        { wrapper: createWrapper(spec, { count: 0 }) }
      );

      expect(result.current.evaluateDisplayTarget('count', undefined)).toBe(false);
    });

    it('should handle non-empty string as truthy', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          name: { type: 'text', label: 'Name' },
        },
      };

      const { result } = renderHook(
        () => useConditional({ path: 'test' }),
        { wrapper: createWrapper(spec, { name: 'John' }) }
      );

      expect(result.current.evaluateDisplayTarget('name', undefined)).toBe(true);
    });
  });

  describe('evaluateAllOf', () => {
    it('should return met=true when all conditions are satisfied', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          a: { type: 'checkbox', label: 'A' },
          b: { type: 'checkbox', label: 'B' },
        },
      };

      const { result } = renderHook(
        () => useConditional({ path: 'test' }),
        { wrapper: createWrapper(spec, { a: true, b: true }) }
      );

      const allOfCondition: AllOfCondition = {
        conditions: { a: true, b: true },
        inline: 'color: green',
        class: 'valid',
        not: {
          inline: 'color: red',
          class: 'invalid',
        },
      };

      const result1 = result.current.evaluateAllOf(allOfCondition);

      expect(result1.met).toBe(true);
      expect(result1.style).toBe('color: green');
      expect(result1.className).toBe('valid');
    });

    it('should return met=false when any condition is not satisfied', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          a: { type: 'checkbox', label: 'A' },
          b: { type: 'checkbox', label: 'B' },
        },
      };

      const { result } = renderHook(
        () => useConditional({ path: 'test' }),
        { wrapper: createWrapper(spec, { a: true, b: false }) }
      );

      const allOfCondition: AllOfCondition = {
        conditions: { a: true, b: true },
        inline: 'color: green',
        class: 'valid',
        not: {
          inline: 'color: red',
          class: 'invalid',
        },
      };

      const result1 = result.current.evaluateAllOf(allOfCondition);

      expect(result1.met).toBe(false);
      expect(result1.style).toBe('color: red');
      expect(result1.className).toBe('invalid');
    });

    it('should handle array conditions (OR within field)', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          status: { type: 'select', label: 'Status' },
        },
      };

      const { result } = renderHook(
        () => useConditional({ path: 'test' }),
        { wrapper: createWrapper(spec, { status: 'pending' }) }
      );

      const allOfCondition: AllOfCondition = {
        conditions: { status: ['draft', 'pending'] },
        class: 'editable',
      };

      const result1 = result.current.evaluateAllOf(allOfCondition);
      expect(result1.met).toBe(true);
    });

    it('should fail array condition when value is not in array', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          status: { type: 'select', label: 'Status' },
        },
      };

      const { result } = renderHook(
        () => useConditional({ path: 'test' }),
        { wrapper: createWrapper(spec, { status: 'approved' }) }
      );

      const allOfCondition: AllOfCondition = {
        conditions: { status: ['draft', 'pending'] },
        class: 'editable',
      };

      const result1 = result.current.evaluateAllOf(allOfCondition);
      expect(result1.met).toBe(false);
    });

    it('should handle string comparison for numeric values', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          id: { type: 'number', label: 'ID' },
        },
      };

      const { result } = renderHook(
        () => useConditional({ path: 'test' }),
        { wrapper: createWrapper(spec, { id: 123 }) }
      );

      const allOfCondition: AllOfCondition = {
        conditions: { id: '123' },
        class: 'matched',
      };

      const result1 = result.current.evaluateAllOf(allOfCondition);
      expect(result1.met).toBe(true);
    });

    it('should handle null/undefined values', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          optional: { type: 'text', label: 'Optional' },
        },
      };

      const { result } = renderHook(
        () => useConditional({ path: 'test' }),
        { wrapper: createWrapper(spec, {}) }
      );

      const allOfCondition: AllOfCondition = {
        conditions: { optional: null },
        class: 'empty',
      };

      const result1 = result.current.evaluateAllOf(allOfCondition);
      expect(result1.met).toBe(true);
    });

    it('should handle multiple conditions (AND logic)', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          role: { type: 'select', label: 'Role' },
          verified: { type: 'checkbox', label: 'Verified' },
          active: { type: 'checkbox', label: 'Active' },
        },
      };

      const { result } = renderHook(
        () => useConditional({ path: 'test' }),
        { wrapper: createWrapper(spec, { role: 'admin', verified: true, active: true }) }
      );

      const allOfCondition: AllOfCondition = {
        conditions: {
          role: 'admin',
          verified: true,
          active: true,
        },
        class: 'super-user',
      };

      const result1 = result.current.evaluateAllOf(allOfCondition);
      expect(result1.met).toBe(true);
    });

    it('should return undefined styles when not specified', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          a: { type: 'checkbox', label: 'A' },
        },
      };

      const { result } = renderHook(
        () => useConditional({ path: 'test' }),
        { wrapper: createWrapper(spec, { a: true }) }
      );

      const allOfCondition: AllOfCondition = {
        conditions: { a: true },
      };

      const result1 = result.current.evaluateAllOf(allOfCondition);
      expect(result1.met).toBe(true);
      expect(result1.style).toBeUndefined();
      expect(result1.className).toBeUndefined();
    });
  });
});

// ============================================================================
// checkFieldVisibility Standalone Function Tests
// ============================================================================

describe('checkFieldVisibility', () => {
  describe('display_switch', () => {
    it('should return true when condition is met', () => {
      const spec = {
        properties: {
          type: { type: 'select' },
          details: {
            type: 'text',
            display_switch: 'type == "special"',
          },
        },
      };

      expect(
        checkFieldVisibility(spec, 'details', { type: 'special' })
      ).toBe(true);
    });

    it('should return false when condition is not met', () => {
      const spec = {
        properties: {
          type: { type: 'select' },
          details: {
            type: 'text',
            display_switch: 'type == "special"',
          },
        },
      };

      expect(
        checkFieldVisibility(spec, 'details', { type: 'normal' })
      ).toBe(false);
    });

    it('should handle complex AND conditions', () => {
      const spec = {
        properties: {
          a: { type: 'checkbox' },
          b: { type: 'checkbox' },
          target: {
            type: 'text',
            display_switch: 'a == true && b == true',
          },
        },
      };

      expect(
        checkFieldVisibility(spec, 'target', { a: true, b: true })
      ).toBe(true);

      expect(
        checkFieldVisibility(spec, 'target', { a: true, b: false })
      ).toBe(false);
    });

    it('should handle complex OR conditions', () => {
      const spec = {
        properties: {
          status: { type: 'select' },
          actions: {
            type: 'text',
            display_switch: 'status == "pending" || status == "review"',
          },
        },
      };

      expect(
        checkFieldVisibility(spec, 'actions', { status: 'pending' })
      ).toBe(true);

      expect(
        checkFieldVisibility(spec, 'actions', { status: 'review' })
      ).toBe(true);

      expect(
        checkFieldVisibility(spec, 'actions', { status: 'completed' })
      ).toBe(false);
    });

    it('should return true for invalid expression', () => {
      const spec = {
        properties: {
          broken: {
            type: 'text',
            display_switch: 'invalid {{{{ syntax',
          },
        },
      };

      expect(checkFieldVisibility(spec, 'broken', {})).toBe(true);
    });
  });

  describe('display_target', () => {
    it('should return true when target is truthy', () => {
      const spec = {
        properties: {
          showExtra: { type: 'checkbox' },
          extra: {
            type: 'text',
            display_target: 'showExtra',
          },
        },
      };

      expect(
        checkFieldVisibility(spec, 'extra', { showExtra: true })
      ).toBe(true);
    });

    it('should return false when target is falsy', () => {
      const spec = {
        properties: {
          showExtra: { type: 'checkbox' },
          extra: {
            type: 'text',
            display_target: 'showExtra',
          },
        },
      };

      expect(
        checkFieldVisibility(spec, 'extra', { showExtra: false })
      ).toBe(false);
    });

    it('should handle nested target path', () => {
      const spec = {
        properties: {
          settings: {
            type: 'group',
            properties: {
              enabled: { type: 'checkbox' },
            },
          },
          configPanel: {
            type: 'text',
            display_target: 'settings.enabled',
          },
        },
      };

      expect(
        checkFieldVisibility(spec, 'configPanel', {
          settings: { enabled: true },
        })
      ).toBe(true);

      expect(
        checkFieldVisibility(spec, 'configPanel', {
          settings: { enabled: false },
        })
      ).toBe(false);
    });
  });

  describe('element.all_of', () => {
    it('should return true when all conditions are met', () => {
      const spec = {
        properties: {
          role: { type: 'select' },
          verified: { type: 'checkbox' },
          adminPanel: {
            type: 'text',
            element: {
              all_of: {
                conditions: { role: 'admin', verified: true },
              },
            },
          },
        },
      };

      expect(
        checkFieldVisibility(spec, 'adminPanel', { role: 'admin', verified: true })
      ).toBe(true);
    });

    it('should return false when any condition is not met', () => {
      const spec = {
        properties: {
          role: { type: 'select' },
          verified: { type: 'checkbox' },
          adminPanel: {
            type: 'text',
            element: {
              all_of: {
                conditions: { role: 'admin', verified: true },
              },
            },
          },
        },
      };

      expect(
        checkFieldVisibility(spec, 'adminPanel', { role: 'admin', verified: false })
      ).toBe(false);

      expect(
        checkFieldVisibility(spec, 'adminPanel', { role: 'user', verified: true })
      ).toBe(false);
    });
  });

  describe('no conditions', () => {
    it('should return true for field without any conditions', () => {
      const spec = {
        properties: {
          normalField: { type: 'text' },
        },
      };

      expect(checkFieldVisibility(spec, 'normalField', {})).toBe(true);
    });

    it('should return true for non-existent field', () => {
      const spec = {
        properties: {},
      };

      expect(checkFieldVisibility(spec, 'unknown', {})).toBe(true);
    });

    it('should return true when properties is empty', () => {
      const spec = {
        properties: {},
      };

      expect(checkFieldVisibility(spec, 'anyField', {})).toBe(true);
    });
  });

  describe('nested fields', () => {
    it('should check visibility for nested field with display_switch', () => {
      const spec = {
        properties: {
          type: { type: 'select' },
          group: {
            type: 'group',
            properties: {
              nested: {
                type: 'text',
                display_switch: 'type == "showNested"',
              },
            },
          },
        },
      };

      expect(
        checkFieldVisibility(spec, 'group.nested', { type: 'showNested' })
      ).toBe(true);

      expect(
        checkFieldVisibility(spec, 'group.nested', { type: 'other' })
      ).toBe(false);
    });
  });
});
