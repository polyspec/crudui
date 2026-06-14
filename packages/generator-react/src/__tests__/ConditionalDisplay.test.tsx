/**
 * Conditional Display Tests
 *
 * Tests for display_switch, display_target, and element.all_of patterns
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { FormContextProvider, useFormContext } from '../legacy/context/FormContext';
import { I18nContextProvider } from '../legacy/context/I18nContext';
import { useConditional, checkFieldVisibility } from '../legacy/hooks/useConditional';
import type { Spec } from '@crudui/validator/legacy';
import type { FormData, AllOfCondition } from '../legacy/types';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Wrapper component for testing with both Form and I18n contexts
 */
function TestWrapper({
  children,
  spec,
  initialData = {},
}: {
  children: React.ReactNode;
  spec: Spec;
  initialData?: FormData;
}) {
  return (
    <I18nContextProvider language="en">
      <FormContextProvider spec={spec} initialData={initialData}>
        {children}
      </FormContextProvider>
    </I18nContextProvider>
  );
}

/**
 * Component to test field visibility
 */
function VisibilityTester({ path }: { path: string }) {
  const { isFieldVisible } = useFormContext();
  const visible = isFieldVisible(path);
  return <div data-testid={`visibility-${path}`}>{visible ? 'visible' : 'hidden'}</div>;
}

/**
 * Component to test conditional hook
 */
function ConditionalTester({
  path,
  displaySwitch,
  allOf,
}: {
  path: string;
  displaySwitch?: string;
  allOf?: AllOfCondition;
}) {
  const { isVisible, evaluateDisplaySwitch, evaluateAllOf } = useConditional({ path });
  const { data } = useFormContext();

  return (
    <div>
      <div data-testid="is-visible">{isVisible(path) ? 'visible' : 'hidden'}</div>
      {displaySwitch && (
        <div data-testid="display-switch">
          {evaluateDisplaySwitch(displaySwitch, { path, data }) ? 'shown' : 'hidden'}
        </div>
      )}
      {allOf && (
        <div data-testid="all-of-result">
          {JSON.stringify(evaluateAllOf(allOf))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// display_switch Tests
// ============================================================================

describe('display_switch', () => {
  describe('basic show/hide based on another field value', () => {
    const specWithDisplaySwitch: Spec = {
      type: 'group',
      name: 'test_form',
      properties: {
        payment_type: {
          type: 'select',
          label: 'Payment Type',
          items: {
            credit: 'Credit Card',
            bank: 'Bank Transfer',
            cash: 'Cash',
          },
        },
        card_number: {
          type: 'text',
          label: 'Card Number',
          display_switch: 'payment_type == "credit"',
        },
        bank_account: {
          type: 'text',
          label: 'Bank Account',
          display_switch: 'payment_type == "bank"',
        },
      },
    };

    it('should hide field when condition is not met', () => {
      render(
        <TestWrapper spec={specWithDisplaySwitch} initialData={{ payment_type: 'cash' }}>
          <VisibilityTester path="card_number" />
          <VisibilityTester path="bank_account" />
        </TestWrapper>
      );

      expect(screen.getByTestId('visibility-card_number').textContent).toBe('hidden');
      expect(screen.getByTestId('visibility-bank_account').textContent).toBe('hidden');
    });

    it('should show field when condition is met', () => {
      render(
        <TestWrapper spec={specWithDisplaySwitch} initialData={{ payment_type: 'credit' }}>
          <VisibilityTester path="card_number" />
          <VisibilityTester path="bank_account" />
        </TestWrapper>
      );

      expect(screen.getByTestId('visibility-card_number').textContent).toBe('visible');
      expect(screen.getByTestId('visibility-bank_account').textContent).toBe('hidden');
    });

    it('should show correct field for each payment type', () => {
      // Credit card
      render(
        <TestWrapper spec={specWithDisplaySwitch} initialData={{ payment_type: 'credit' }}>
          <VisibilityTester path="card_number" />
          <VisibilityTester path="bank_account" />
        </TestWrapper>
      );
      expect(screen.getByTestId('visibility-card_number').textContent).toBe('visible');
      expect(screen.getByTestId('visibility-bank_account').textContent).toBe('hidden');

      // Cleanup and rerender with bank transfer
      cleanup();
      render(
        <TestWrapper spec={specWithDisplaySwitch} initialData={{ payment_type: 'bank' }}>
          <VisibilityTester path="card_number" />
          <VisibilityTester path="bank_account" />
        </TestWrapper>
      );
      expect(screen.getByTestId('visibility-card_number').textContent).toBe('hidden');
      expect(screen.getByTestId('visibility-bank_account').textContent).toBe('visible');
    });
  });

  describe('multiple fields controlled by same switch', () => {
    const specWithMultipleFields: Spec = {
      type: 'group',
      name: 'test_form',
      properties: {
        has_address: {
          type: 'checkbox',
          label: 'Has Address',
        },
        street: {
          type: 'text',
          label: 'Street',
          display_switch: 'has_address == true',
        },
        city: {
          type: 'text',
          label: 'City',
          display_switch: 'has_address == true',
        },
        zip_code: {
          type: 'text',
          label: 'Zip Code',
          display_switch: 'has_address == true',
        },
      },
    };

    it('should hide all address fields when has_address is false', () => {
      render(
        <TestWrapper spec={specWithMultipleFields} initialData={{ has_address: false }}>
          <VisibilityTester path="street" />
          <VisibilityTester path="city" />
          <VisibilityTester path="zip_code" />
        </TestWrapper>
      );

      expect(screen.getByTestId('visibility-street').textContent).toBe('hidden');
      expect(screen.getByTestId('visibility-city').textContent).toBe('hidden');
      expect(screen.getByTestId('visibility-zip_code').textContent).toBe('hidden');
    });

    it('should show all address fields when has_address is true', () => {
      render(
        <TestWrapper spec={specWithMultipleFields} initialData={{ has_address: true }}>
          <VisibilityTester path="street" />
          <VisibilityTester path="city" />
          <VisibilityTester path="zip_code" />
        </TestWrapper>
      );

      expect(screen.getByTestId('visibility-street').textContent).toBe('visible');
      expect(screen.getByTestId('visibility-city').textContent).toBe('visible');
      expect(screen.getByTestId('visibility-zip_code').textContent).toBe('visible');
    });
  });

  describe('nested display conditions', () => {
    const specWithNestedConditions: Spec = {
      type: 'group',
      name: 'test_form',
      properties: {
        user_type: {
          type: 'select',
          label: 'User Type',
          items: {
            personal: 'Personal',
            business: 'Business',
          },
        },
        company_name: {
          type: 'text',
          label: 'Company Name',
          display_switch: 'user_type == "business"',
        },
        company_size: {
          type: 'select',
          label: 'Company Size',
          display_switch: 'user_type == "business"',
          items: {
            small: 'Small (1-10)',
            medium: 'Medium (11-100)',
            large: 'Large (100+)',
          },
        },
        enterprise_contact: {
          type: 'text',
          label: 'Enterprise Contact',
          display_switch: 'user_type == "business" && company_size == "large"',
        },
      },
    };

    it('should hide all business fields for personal users', () => {
      render(
        <TestWrapper spec={specWithNestedConditions} initialData={{ user_type: 'personal' }}>
          <VisibilityTester path="company_name" />
          <VisibilityTester path="company_size" />
          <VisibilityTester path="enterprise_contact" />
        </TestWrapper>
      );

      expect(screen.getByTestId('visibility-company_name').textContent).toBe('hidden');
      expect(screen.getByTestId('visibility-company_size').textContent).toBe('hidden');
      expect(screen.getByTestId('visibility-enterprise_contact').textContent).toBe('hidden');
    });

    it('should show company fields for business users', () => {
      render(
        <TestWrapper
          spec={specWithNestedConditions}
          initialData={{ user_type: 'business', company_size: 'small' }}
        >
          <VisibilityTester path="company_name" />
          <VisibilityTester path="company_size" />
          <VisibilityTester path="enterprise_contact" />
        </TestWrapper>
      );

      expect(screen.getByTestId('visibility-company_name').textContent).toBe('visible');
      expect(screen.getByTestId('visibility-company_size').textContent).toBe('visible');
      expect(screen.getByTestId('visibility-enterprise_contact').textContent).toBe('hidden');
    });

    it('should show enterprise contact only for large businesses', () => {
      render(
        <TestWrapper
          spec={specWithNestedConditions}
          initialData={{ user_type: 'business', company_size: 'large' }}
        >
          <VisibilityTester path="enterprise_contact" />
        </TestWrapper>
      );

      expect(screen.getByTestId('visibility-enterprise_contact').textContent).toBe('visible');
    });
  });

  describe('complex conditions with OR', () => {
    const specWithOrCondition: Spec = {
      type: 'group',
      name: 'test_form',
      properties: {
        status: {
          type: 'select',
          label: 'Status',
          items: {
            pending: 'Pending',
            approved: 'Approved',
            rejected: 'Rejected',
          },
        },
        action_buttons: {
          type: 'text',
          label: 'Actions',
          display_switch: 'status == "pending" || status == "approved"',
        },
      },
    };

    it('should show when either condition is met', () => {
      // Pending status
      render(
        <TestWrapper spec={specWithOrCondition} initialData={{ status: 'pending' }}>
          <VisibilityTester path="action_buttons" />
        </TestWrapper>
      );
      expect(screen.getByTestId('visibility-action_buttons').textContent).toBe('visible');

      // Approved status
      cleanup();
      render(
        <TestWrapper spec={specWithOrCondition} initialData={{ status: 'approved' }}>
          <VisibilityTester path="action_buttons" />
        </TestWrapper>
      );
      expect(screen.getByTestId('visibility-action_buttons').textContent).toBe('visible');

      // Rejected status
      cleanup();
      render(
        <TestWrapper spec={specWithOrCondition} initialData={{ status: 'rejected' }}>
          <VisibilityTester path="action_buttons" />
        </TestWrapper>
      );
      expect(screen.getByTestId('visibility-action_buttons').textContent).toBe('hidden');
    });
  });

  describe('numeric comparisons', () => {
    const specWithNumericCondition: Spec = {
      type: 'group',
      name: 'test_form',
      properties: {
        age: {
          type: 'number',
          label: 'Age',
        },
        adult_content: {
          type: 'text',
          label: 'Adult Content',
          display_switch: 'age >= 18',
        },
        senior_discount: {
          type: 'text',
          label: 'Senior Discount',
          display_switch: 'age >= 65',
        },
      },
    };

    it('should evaluate numeric comparison correctly', () => {
      // Age under 18
      render(
        <TestWrapper spec={specWithNumericCondition} initialData={{ age: 17 }}>
          <VisibilityTester path="adult_content" />
          <VisibilityTester path="senior_discount" />
        </TestWrapper>
      );
      expect(screen.getByTestId('visibility-adult_content').textContent).toBe('hidden');
      expect(screen.getByTestId('visibility-senior_discount').textContent).toBe('hidden');

      // Age 25
      cleanup();
      render(
        <TestWrapper spec={specWithNumericCondition} initialData={{ age: 25 }}>
          <VisibilityTester path="adult_content" />
          <VisibilityTester path="senior_discount" />
        </TestWrapper>
      );
      expect(screen.getByTestId('visibility-adult_content').textContent).toBe('visible');
      expect(screen.getByTestId('visibility-senior_discount').textContent).toBe('hidden');

      // Age 70
      cleanup();
      render(
        <TestWrapper spec={specWithNumericCondition} initialData={{ age: 70 }}>
          <VisibilityTester path="adult_content" />
          <VisibilityTester path="senior_discount" />
        </TestWrapper>
      );
      expect(screen.getByTestId('visibility-adult_content').textContent).toBe('visible');
      expect(screen.getByTestId('visibility-senior_discount').textContent).toBe('visible');
    });
  });
});

// ============================================================================
// display_target Tests
// ============================================================================

describe('display_target', () => {
  const specWithDisplayTarget: Spec = {
    type: 'group',
    name: 'test_form',
    properties: {
      show_details: {
        type: 'checkbox',
        label: 'Show Details',
      },
      details_section: {
        type: 'text',
        label: 'Details',
        display_target: 'show_details',
      },
    },
  };

  it('should hide field when target is falsy', () => {
    render(
      <TestWrapper spec={specWithDisplayTarget} initialData={{ show_details: false }}>
        <VisibilityTester path="details_section" />
      </TestWrapper>
    );

    expect(screen.getByTestId('visibility-details_section').textContent).toBe('hidden');
  });

  it('should show field when target is truthy', () => {
    render(
      <TestWrapper spec={specWithDisplayTarget} initialData={{ show_details: true }}>
        <VisibilityTester path="details_section" />
      </TestWrapper>
    );

    expect(screen.getByTestId('visibility-details_section').textContent).toBe('visible');
  });

  it('should work with string values (non-empty is truthy)', () => {
    const specWithStringTarget: Spec = {
      type: 'group',
      name: 'test_form',
      properties: {
        category: {
          type: 'select',
          label: 'Category',
          items: {
            '': 'Select...',
            electronics: 'Electronics',
            clothing: 'Clothing',
          },
        },
        category_details: {
          type: 'text',
          label: 'Category Details',
          display_target: 'category',
        },
      },
    };

    // Empty string
    render(
      <TestWrapper spec={specWithStringTarget} initialData={{ category: '' }}>
        <VisibilityTester path="category_details" />
      </TestWrapper>
    );
    expect(screen.getByTestId('visibility-category_details').textContent).toBe('hidden');

    // Non-empty string
    cleanup();
    render(
      <TestWrapper spec={specWithStringTarget} initialData={{ category: 'electronics' }}>
        <VisibilityTester path="category_details" />
      </TestWrapper>
    );
    expect(screen.getByTestId('visibility-category_details').textContent).toBe('visible');
  });
});

// ============================================================================
// element.all_of Tests
// ============================================================================

describe('element.all_of', () => {
  describe('basic all_of conditions', () => {
    const specWithAllOf: Spec = {
      type: 'group',
      name: 'test_form',
      properties: {
        is_premium: {
          type: 'checkbox',
          label: 'Premium User',
        },
        is_verified: {
          type: 'checkbox',
          label: 'Verified',
        },
        premium_features: {
          type: 'text',
          label: 'Premium Features',
          element: {
            all_of: {
              conditions: {
                is_premium: true,
                is_verified: true,
              },
              inline: 'display: block',
              class: 'premium-visible',
              not: {
                inline: 'display: none',
                class: 'premium-hidden',
              },
            },
          },
        },
      },
    };

    it('should return not met when conditions are not satisfied', () => {
      render(
        <TestWrapper spec={specWithAllOf} initialData={{ is_premium: true, is_verified: false }}>
          <ConditionalTester
            path="premium_features"
            allOf={{
              conditions: { is_premium: true, is_verified: true },
              inline: 'display: block',
              class: 'premium-visible',
              not: {
                inline: 'display: none',
                class: 'premium-hidden',
              },
            }}
          />
        </TestWrapper>
      );

      const result = JSON.parse(screen.getByTestId('all-of-result').textContent || '{}');
      expect(result.met).toBe(false);
      expect(result.style).toBe('display: none');
      expect(result.className).toBe('premium-hidden');
    });

    it('should return met when all conditions are satisfied', () => {
      render(
        <TestWrapper spec={specWithAllOf} initialData={{ is_premium: true, is_verified: true }}>
          <ConditionalTester
            path="premium_features"
            allOf={{
              conditions: { is_premium: true, is_verified: true },
              inline: 'display: block',
              class: 'premium-visible',
              not: {
                inline: 'display: none',
                class: 'premium-hidden',
              },
            }}
          />
        </TestWrapper>
      );

      const result = JSON.parse(screen.getByTestId('all-of-result').textContent || '{}');
      expect(result.met).toBe(true);
      expect(result.style).toBe('display: block');
      expect(result.className).toBe('premium-visible');
    });
  });

  describe('all_of with array conditions (OR within field)', () => {
    it('should match if value is one of the array options', () => {
      const specWithArrayCondition: Spec = {
        type: 'group',
        name: 'test_form',
        properties: {
          status: {
            type: 'select',
            label: 'Status',
            items: {
              draft: 'Draft',
              pending: 'Pending',
              approved: 'Approved',
              rejected: 'Rejected',
            },
          },
          editable_notice: {
            type: 'text',
            label: 'Editable Notice',
            element: {
              all_of: {
                conditions: {
                  status: ['draft', 'pending'], // status can be either 'draft' OR 'pending'
                },
                class: 'editable',
              },
            },
          },
        },
      };

      // Draft status
      render(
        <TestWrapper spec={specWithArrayCondition} initialData={{ status: 'draft' }}>
          <ConditionalTester
            path="editable_notice"
            allOf={{
              conditions: { status: ['draft', 'pending'] },
              class: 'editable',
            }}
          />
        </TestWrapper>
      );

      let result = JSON.parse(screen.getByTestId('all-of-result').textContent || '{}');
      expect(result.met).toBe(true);

      // Pending status
      cleanup();
      render(
        <TestWrapper spec={specWithArrayCondition} initialData={{ status: 'pending' }}>
          <ConditionalTester
            path="editable_notice"
            allOf={{
              conditions: { status: ['draft', 'pending'] },
              class: 'editable',
            }}
          />
        </TestWrapper>
      );

      result = JSON.parse(screen.getByTestId('all-of-result').textContent || '{}');
      expect(result.met).toBe(true);

      // Approved status
      cleanup();
      render(
        <TestWrapper spec={specWithArrayCondition} initialData={{ status: 'approved' }}>
          <ConditionalTester
            path="editable_notice"
            allOf={{
              conditions: { status: ['draft', 'pending'] },
              class: 'editable',
            }}
          />
        </TestWrapper>
      );

      result = JSON.parse(screen.getByTestId('all-of-result').textContent || '{}');
      expect(result.met).toBe(false);
    });
  });

  describe('all_of with multiple conditions', () => {
    it('should require all conditions to be met (AND logic)', () => {
      const spec: Spec = {
        type: 'group',
        name: 'test_form',
        properties: {
          country: { type: 'text', label: 'Country' },
          age: { type: 'number', label: 'Age' },
          verified: { type: 'checkbox', label: 'Verified' },
        },
      };

      // All conditions met
      render(
        <TestWrapper spec={spec} initialData={{ country: 'US', age: 21, verified: true }}>
          <ConditionalTester
            path="test"
            allOf={{
              conditions: { country: 'US', age: 21, verified: true },
              class: 'eligible',
            }}
          />
        </TestWrapper>
      );

      const result = JSON.parse(screen.getByTestId('all-of-result').textContent || '{}');
      expect(result.met).toBe(true);
    });

    it('should fail if any condition is not met', () => {
      const spec: Spec = {
        type: 'group',
        name: 'test_form',
        properties: {
          country: { type: 'text', label: 'Country' },
          age: { type: 'number', label: 'Age' },
          verified: { type: 'checkbox', label: 'Verified' },
        },
      };

      // One condition not met
      render(
        <TestWrapper spec={spec} initialData={{ country: 'US', age: 21, verified: false }}>
          <ConditionalTester
            path="test"
            allOf={{
              conditions: { country: 'US', age: 21, verified: true },
              class: 'eligible',
            }}
          />
        </TestWrapper>
      );

      const result = JSON.parse(screen.getByTestId('all-of-result').textContent || '{}');
      expect(result.met).toBe(false);
    });
  });
});

// ============================================================================
// display_target_condition_style and display_target_condition_class Tests
// ============================================================================

describe('display_target styling', () => {
  describe('element.all_of applies CSS styles', () => {
    const spec: Spec = {
      type: 'group',
      name: 'test_form',
      properties: {
        status: {
          type: 'select',
          label: 'Status',
          items: {
            active: 'Active',
            inactive: 'Inactive',
          },
        },
        status_indicator: {
          type: 'text',
          label: 'Status Indicator',
          element: {
            all_of: {
              conditions: { status: 'active' },
              inline: 'background-color: green; color: white',
              class: 'status-active',
              not: {
                inline: 'background-color: gray; color: black',
                class: 'status-inactive',
              },
            },
          },
        },
      },
    };

    it('should return correct inline styles when conditions met', () => {
      render(
        <TestWrapper spec={spec} initialData={{ status: 'active' }}>
          <ConditionalTester
            path="status_indicator"
            allOf={{
              conditions: { status: 'active' },
              inline: 'background-color: green; color: white',
              class: 'status-active',
              not: {
                inline: 'background-color: gray; color: black',
                class: 'status-inactive',
              },
            }}
          />
        </TestWrapper>
      );

      const result = JSON.parse(screen.getByTestId('all-of-result').textContent || '{}');
      expect(result.met).toBe(true);
      expect(result.style).toBe('background-color: green; color: white');
      expect(result.className).toBe('status-active');
    });

    it('should return not styles when conditions not met', () => {
      render(
        <TestWrapper spec={spec} initialData={{ status: 'inactive' }}>
          <ConditionalTester
            path="status_indicator"
            allOf={{
              conditions: { status: 'active' },
              inline: 'background-color: green; color: white',
              class: 'status-active',
              not: {
                inline: 'background-color: gray; color: black',
                class: 'status-inactive',
              },
            }}
          />
        </TestWrapper>
      );

      const result = JSON.parse(screen.getByTestId('all-of-result').textContent || '{}');
      expect(result.met).toBe(false);
      expect(result.style).toBe('background-color: gray; color: black');
      expect(result.className).toBe('status-inactive');
    });
  });

  describe('element.all_of applies CSS classes', () => {
    it('should return appropriate class based on condition', () => {
      const spec: Spec = {
        type: 'group',
        name: 'test_form',
        properties: {
          priority: {
            type: 'select',
            label: 'Priority',
            items: {
              low: 'Low',
              medium: 'Medium',
              high: 'High',
            },
          },
        },
      };

      // High priority
      render(
        <TestWrapper spec={spec} initialData={{ priority: 'high' }}>
          <ConditionalTester
            path="priority_indicator"
            allOf={{
              conditions: { priority: 'high' },
              class: 'priority-high badge-danger',
              not: {
                class: 'priority-normal',
              },
            }}
          />
        </TestWrapper>
      );

      const result = JSON.parse(screen.getByTestId('all-of-result').textContent || '{}');
      expect(result.met).toBe(true);
      expect(result.className).toBe('priority-high badge-danger');
    });

    it('should return not class when condition not met', () => {
      const spec: Spec = {
        type: 'group',
        name: 'test_form',
        properties: {
          priority: { type: 'select', label: 'Priority' },
        },
      };

      render(
        <TestWrapper spec={spec} initialData={{ priority: 'low' }}>
          <ConditionalTester
            path="priority_indicator"
            allOf={{
              conditions: { priority: 'high' },
              class: 'priority-high badge-danger',
              not: {
                class: 'priority-normal',
              },
            }}
          />
        </TestWrapper>
      );

      const result = JSON.parse(screen.getByTestId('all-of-result').textContent || '{}');
      expect(result.met).toBe(false);
      expect(result.className).toBe('priority-normal');
    });
  });
});

// ============================================================================
// checkFieldVisibility standalone function tests
// ============================================================================

describe('checkFieldVisibility', () => {
  it('should check display_switch condition', () => {
    const spec = {
      properties: {
        type: { type: 'select' },
        type_detail: {
          type: 'text',
          display_switch: 'type == "special"',
        },
      },
    };

    expect(checkFieldVisibility(spec, 'type_detail', { type: 'normal' })).toBe(false);
    expect(checkFieldVisibility(spec, 'type_detail', { type: 'special' })).toBe(true);
  });

  it('should check display_target condition', () => {
    const spec = {
      properties: {
        show_extra: { type: 'checkbox' },
        extra_field: {
          type: 'text',
          display_target: 'show_extra',
        },
      },
    };

    expect(checkFieldVisibility(spec, 'extra_field', { show_extra: false })).toBe(false);
    expect(checkFieldVisibility(spec, 'extra_field', { show_extra: true })).toBe(true);
  });

  it('should check element.all_of condition', () => {
    const spec = {
      properties: {
        a: { type: 'checkbox' },
        b: { type: 'checkbox' },
        ab_field: {
          type: 'text',
          element: {
            all_of: {
              conditions: { a: true, b: true },
            },
          },
        },
      },
    };

    expect(checkFieldVisibility(spec, 'ab_field', { a: true, b: false })).toBe(false);
    expect(checkFieldVisibility(spec, 'ab_field', { a: true, b: true })).toBe(true);
  });

  it('should return true for field without conditions', () => {
    const spec = {
      properties: {
        normal_field: { type: 'text' },
      },
    };

    expect(checkFieldVisibility(spec, 'normal_field', {})).toBe(true);
  });

  it('should return true for unknown field', () => {
    const spec = {
      properties: {},
    };

    expect(checkFieldVisibility(spec, 'unknown_field', {})).toBe(true);
  });
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe('edge cases', () => {
  it('should handle undefined/null values in conditions', () => {
    const spec: Spec = {
      type: 'group',
      name: 'test_form',
      properties: {
        optional: { type: 'text', label: 'Optional' },
        dependent: {
          type: 'text',
          label: 'Dependent',
          display_target: 'optional',
        },
      },
    };

    render(
      <TestWrapper spec={spec} initialData={{}}>
        <VisibilityTester path="dependent" />
      </TestWrapper>
    );

    expect(screen.getByTestId('visibility-dependent').textContent).toBe('hidden');
  });

  it('should handle invalid display_switch expressions gracefully', () => {
    const spec: Spec = {
      type: 'group',
      name: 'test_form',
      properties: {
        field: {
          type: 'text',
          label: 'Field',
          display_switch: 'invalid syntax {{{{',
        },
      },
    };

    // Should not throw and default to visible
    render(
      <TestWrapper spec={spec} initialData={{}}>
        <VisibilityTester path="field" />
      </TestWrapper>
    );

    // Invalid syntax should default to visible
    expect(screen.getByTestId('visibility-field').textContent).toBe('visible');
  });

  it('should handle deeply nested paths', () => {
    const spec: Spec = {
      type: 'group',
      name: 'test_form',
      properties: {
        level1: {
          type: 'group',
          properties: {
            level2: {
              type: 'group',
              properties: {
                show: { type: 'checkbox' },
                content: {
                  type: 'text',
                  display_target: 'level1.level2.show',
                },
              },
            },
          },
        },
      },
    };

    render(
      <TestWrapper
        spec={spec}
        initialData={{ level1: { level2: { show: true } } }}
      >
        <VisibilityTester path="level1.level2.content" />
      </TestWrapper>
    );

    expect(screen.getByTestId('visibility-level1.level2.content').textContent).toBe('visible');
  });

  it('should handle empty string vs null/undefined', () => {
    const spec: Spec = {
      type: 'group',
      name: 'test_form',
      properties: {
        value: { type: 'text', label: 'Value' },
        dependent: {
          type: 'text',
          label: 'Dependent',
          display_target: 'value',
        },
      },
    };

    // Empty string is falsy
    render(
      <TestWrapper spec={spec} initialData={{ value: '' }}>
        <VisibilityTester path="dependent" />
      </TestWrapper>
    );
    expect(screen.getByTestId('visibility-dependent').textContent).toBe('hidden');
  });

  it('should handle numeric zero correctly', () => {
    const spec: Spec = {
      type: 'group',
      name: 'test_form',
      properties: {
        count: { type: 'number', label: 'Count' },
        dependent: {
          type: 'text',
          label: 'Dependent',
          display_target: 'count',
        },
      },
    };

    // Zero is falsy
    render(
      <TestWrapper spec={spec} initialData={{ count: 0 }}>
        <VisibilityTester path="dependent" />
      </TestWrapper>
    );
    expect(screen.getByTestId('visibility-dependent').textContent).toBe('hidden');
  });
});
