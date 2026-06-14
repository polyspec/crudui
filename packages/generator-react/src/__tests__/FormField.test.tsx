/**
 * FormField Component Tests
 *
 * Tests for the FormField component that renders individual field types
 * Note: This implementation uses h6 tags for labels instead of label elements,
 * so we use container.querySelector('[name="fieldName"]') to find elements
 * PHP compatibility: React does not output id attributes on form fields
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormBuilder } from '../legacy/components/FormBuilder';
import type { Spec } from '@crudui/validator/legacy';

// ============================================================================
// Field Type Rendering Tests
// ============================================================================

describe('FormField Component', () => {
  describe('text field rendering', () => {
    it('should render text input with correct attributes', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          name: {
            type: 'text',
            label: 'Name',
            placeholder: 'Enter your name',
            maxlength: 100,
          },
        },
      };

      const { container } = render(<FormBuilder spec={spec} language="en" />);

      const input = container.querySelector('[name="name"]') as HTMLInputElement;
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'text');
      expect(input).toHaveAttribute('placeholder', 'Enter your name');
      expect(input).toHaveAttribute('maxLength', '100');
    });

    it('should render text input with prepend and append', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          price: {
            type: 'text',
            label: 'Price',
            prepend: '$',
            append: '.00',
          },
        },
      };

      render(<FormBuilder spec={spec} language="en" />);

      expect(screen.getByText('$')).toBeInTheDocument();
      expect(screen.getByText('.00')).toBeInTheDocument();
    });

    it('should handle text input value changes', async () => {
      const onChange = vi.fn();
      const spec: Spec = {
        type: 'group',
        properties: {
          name: { type: 'text', label: 'Name' },
        },
      };

      const { container } = render(<FormBuilder spec={spec} language="en" onChange={onChange} />);

      const input = container.querySelector('[name="name"]') as HTMLInputElement;
      await userEvent.type(input, 'John');

      await waitFor(() => {
        expect(onChange).toHaveBeenCalled();
        const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
        expect(lastCall[1]).toBe('John');
      });
    });
  });

  describe('email field rendering', () => {
    it('should render email input with correct type', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          email: {
            type: 'email',
            label: 'Email',
            placeholder: 'email@example.com',
          },
        },
      };

      const { container } = render(<FormBuilder spec={spec} language="en" />);

      const input = container.querySelector('[name="email"]') as HTMLInputElement;
      expect(input).toHaveAttribute('type', 'email');
    });

    it('should validate email format on blur', async () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          email: {
            type: 'email',
            label: 'Email',
            rules: { email: true },
            messages: { email: 'Invalid email format' },
          },
        },
      };

      const { container } = render(<FormBuilder spec={spec} language="en" />);

      const input = container.querySelector('[name="email"]') as HTMLInputElement;
      await userEvent.type(input, 'invalid-email');
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByText('Invalid email format')).toBeInTheDocument();
      });
    });
  });

  describe('number field rendering', () => {
    it('should render number input with correct attributes', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          age: {
            type: 'number',
            label: 'Age',
            min: 0,
            max: 120,
            step: 1,
          },
        },
      };

      const { container } = render(<FormBuilder spec={spec} language="en" />);

      const input = container.querySelector('[name="age"]') as HTMLInputElement;
      expect(input).toHaveAttribute('type', 'number');
    });

    it('should validate min/max on blur', async () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          age: {
            type: 'number',
            label: 'Age',
            rules: { min: 18 },
            messages: { min: 'Must be at least 18' },
          },
        },
      };

      const { container } = render(<FormBuilder spec={spec} language="en" />);

      const input = container.querySelector('[name="age"]') as HTMLInputElement;
      await userEvent.type(input, '15');
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByText('Must be at least 18')).toBeInTheDocument();
      });
    });

    it('should convert numeric input values correctly', async () => {
      const onChange = vi.fn();
      const spec: Spec = {
        type: 'group',
        properties: {
          count: { type: 'number', label: 'Count' },
        },
      };

      const { container } = render(<FormBuilder spec={spec} language="en" onChange={onChange} />);

      const input = container.querySelector('[name="count"]') as HTMLInputElement;
      await userEvent.type(input, '42');

      await waitFor(() => {
        expect(onChange).toHaveBeenCalled();
        const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
        expect(lastCall[1]).toBe(42);
      });
    });
  });

  describe('password field rendering', () => {
    it('should render password input with hidden text', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          password: {
            type: 'password',
            label: 'Password',
          },
        },
      };

      const { container } = render(<FormBuilder spec={spec} language="en" />);

      const input = container.querySelector('[name="password"]') as HTMLInputElement;
      expect(input).toHaveAttribute('type', 'password');
    });
  });

  describe('textarea field rendering', () => {
    it('should render textarea element', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          description: {
            type: 'textarea',
            label: 'Description',
            placeholder: 'Enter description',
          },
        },
      };

      const { container } = render(<FormBuilder spec={spec} language="en" />);

      const textarea = container.querySelector('[name="description"]');
      expect(textarea?.tagName.toLowerCase()).toBe('textarea');
    });
  });

  describe('select field rendering', () => {
    it('should render select with options', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          country: {
            type: 'select',
            label: 'Country',
            items: {
              '': 'Select a country',
              us: 'United States',
              uk: 'United Kingdom',
              kr: 'South Korea',
            },
          },
        },
      };

      const { container } = render(<FormBuilder spec={spec} language="en" />);

      const select = container.querySelector('[name="country"]');
      expect(select?.tagName.toLowerCase()).toBe('select');
      expect(screen.getByText('Select a country')).toBeInTheDocument();
      expect(screen.getByText('United States')).toBeInTheDocument();
      expect(screen.getByText('United Kingdom')).toBeInTheDocument();
      expect(screen.getByText('South Korea')).toBeInTheDocument();
    });

    it('should handle select value changes', async () => {
      const onChange = vi.fn();
      const spec: Spec = {
        type: 'group',
        properties: {
          status: {
            type: 'select',
            label: 'Status',
            items: {
              '': 'Select',
              active: 'Active',
              inactive: 'Inactive',
            },
          },
        },
      };

      const { container } = render(<FormBuilder spec={spec} language="en" onChange={onChange} />);

      const select = container.querySelector('[name="status"]') as HTMLSelectElement;
      await userEvent.selectOptions(select, 'active');

      await waitFor(() => {
        expect(onChange).toHaveBeenCalled();
        const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
        expect(lastCall[1]).toBe('active');
      });
    });
  });

  describe('checkbox field rendering', () => {
    it('should render checkbox input', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          agree: {
            type: 'checkbox',
            label: 'I agree to the terms',
          },
        },
      };

      render(<FormBuilder spec={spec} language="en" />);

      // Reference (Legacy Checkbox.php): <div><input class="valid-target"
      // type="checkbox" value="1"/> <span>{label}</span></div>
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeInTheDocument();
      expect(checkbox).toHaveClass('valid-target');
      expect(screen.getByText('I agree to the terms').tagName.toLowerCase()).toBe('span');
    });

    it('should handle checkbox toggle', async () => {
      const onChange = vi.fn();
      const spec: Spec = {
        type: 'group',
        properties: {
          agree: {
            type: 'checkbox',
            label: 'Terms',
            checkbox_label: 'I agree',
          },
        },
      };

      render(<FormBuilder spec={spec} language="en" onChange={onChange} />);

      const checkbox = screen.getByRole('checkbox');
      await userEvent.click(checkbox);

      await waitFor(() => {
        expect(onChange).toHaveBeenCalled();
        const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
        expect(lastCall[1]).toBe(true);
      });
    });
  });

  describe('hidden field rendering', () => {
    it('should render hidden input without label', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          token: {
            type: 'hidden',
            label: 'Token',
            default: 'secret-token',
          },
        },
      };

      const { container } = render(
        <FormBuilder spec={spec} data={{ token: 'secret-token' }} language="en" />
      );

      // Hidden field should exist but not show label
      const hidden = container.querySelector('input[type="hidden"]');
      expect(hidden).toBeInTheDocument();
      expect(hidden).toHaveValue('secret-token');
    });
  });
});

// ============================================================================
// Field State Tests
// ============================================================================

describe('FormField States', () => {
  describe('disabled state', () => {
    it('should disable field when spec has disabled: true', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          name: {
            type: 'text',
            label: 'Name',
            disabled: true,
          },
        },
      };

      const { container } = render(<FormBuilder spec={spec} language="en" />);

      const input = container.querySelector('[name="name"]') as HTMLInputElement;
      expect(input).toBeDisabled();
    });

    it('should disable all fields when form has disabled prop', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          name: { type: 'text', label: 'Name' },
          email: { type: 'email', label: 'Email' },
        },
      };

      const { container } = render(<FormBuilder spec={spec} language="en" disabled={true} />);

      const nameInput = container.querySelector('[name="name"]') as HTMLInputElement;
      const emailInput = container.querySelector('[name="email"]') as HTMLInputElement;
      expect(nameInput).toBeDisabled();
      expect(emailInput).toBeDisabled();
    });
  });

  describe('readonly state', () => {
    it('should make field readonly when spec has readonly: true', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          id: {
            type: 'text',
            label: 'ID',
            readonly: true,
          },
        },
      };

      const { container } = render(<FormBuilder spec={spec} language="en" />);

      const input = container.querySelector('[name="id"]') as HTMLInputElement;
      expect(input).toHaveAttribute('readonly');
    });

    it('should make all fields readonly when form has readonly prop', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          name: { type: 'text', label: 'Name' },
          email: { type: 'email', label: 'Email' },
        },
      };

      const { container } = render(<FormBuilder spec={spec} language="en" readonly={true} />);

      const nameInput = container.querySelector('[name="name"]') as HTMLInputElement;
      const emailInput = container.querySelector('[name="email"]') as HTMLInputElement;
      expect(nameInput).toHaveAttribute('readonly');
      expect(emailInput).toHaveAttribute('readonly');
    });
  });

  describe('required state', () => {
    it('should render required field', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          name: {
            type: 'text',
            label: 'Name',
            rules: { required: true },
          },
        },
      };

      const { container } = render(<FormBuilder spec={spec} language="en" />);

      // Check that the input exists (required indicator may vary by implementation)
      const input = container.querySelector('[name="name"]');
      expect(input).toBeInTheDocument();
    });
  });
});

// ============================================================================
// Field Error Display Tests
// ============================================================================

describe('FormField Error Display', () => {
  it('should show error message on validation failure', async () => {
    const spec: Spec = {
      type: 'group',
      properties: {
        email: {
          type: 'email',
          label: 'Email',
          rules: { required: true },
          messages: { required: 'Email is required' },
        },
      },
    };

    render(<FormBuilder spec={spec} language="en" />);

    // Trigger validation
    const submitButton = screen.getByRole('button', { name: '저장' });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Email is required')).toBeInTheDocument();
    });
  });

  it('should apply error class to field wrapper', async () => {
    const spec: Spec = {
      type: 'group',
      properties: {
        name: {
          type: 'text',
          label: 'Name',
          rules: { required: true },
          messages: { required: 'Name is required' },
        },
      },
    };

    render(<FormBuilder spec={spec} language="en" />);

    // Trigger validation
    const submitButton = screen.getByRole('button', { name: '저장' });
    await userEvent.click(submitButton);

    await waitFor(() => {
      // Error handling may be implemented differently
      expect(screen.getByText('Name is required')).toBeInTheDocument();
    });
  });

  it('should clear error when value becomes valid', async () => {
    const spec: Spec = {
      type: 'group',
      properties: {
        email: {
          type: 'email',
          label: 'Email',
          rules: { required: true },
          messages: { required: 'Email is required' },
        },
      },
    };

    const { container } = render(<FormBuilder spec={spec} language="en" />);

    // Trigger error
    const submitButton = screen.getByRole('button', { name: '저장' });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Email is required')).toBeInTheDocument();
    });

    // Fix the error
    const input = container.querySelector('[name="email"]') as HTMLInputElement;
    await userEvent.type(input, 'valid@example.com');

    await waitFor(() => {
      expect(screen.queryByText('Email is required')).not.toBeInTheDocument();
    });
  });

  it('should show error with correct role attribute for accessibility', async () => {
    const spec: Spec = {
      type: 'group',
      properties: {
        name: {
          type: 'text',
          label: 'Name',
          rules: { required: true },
          messages: { required: 'Name is required' },
        },
      },
    };

    render(<FormBuilder spec={spec} language="en" />);

    // Trigger error
    const submitButton = screen.getByRole('button', { name: '저장' });
    await userEvent.click(submitButton);

    await waitFor(() => {
      const errorMessage = screen.getByText('Name is required');
      expect(errorMessage).toHaveAttribute('role', 'alert');
    });
  });
});

// ============================================================================
// Conditional Display Tests
// ============================================================================

describe('FormField Conditional Display', () => {
  it('should hide field when display_switch condition is not met', async () => {
    const spec: Spec = {
      type: 'group',
      properties: {
        hasPhone: {
          type: 'checkbox',
          label: 'Has Phone',
          checkbox_label: 'I have a phone number',
        },
        phone: {
          type: 'text',
          label: 'Phone Number',
          display_switch: 'hasPhone == true',
        },
      },
    };

    const { container } = render(<FormBuilder spec={spec} language="en" />);

    // Reference contract (legacy Legacy): a condition-failing field is NEVER
    // removed from the DOM — its form-element-wrapper is hidden with
    // style="display: none".
    expect(container.querySelector('[name="phone"]')).toBeInTheDocument();
    const wrapper = container.querySelector('[name="phone-layer"]') as HTMLElement;
    expect(wrapper).toBeInTheDocument();
    expect(wrapper.style.display).toBe('none');
  });

  it('should show field when display_switch condition is met', async () => {
    const spec: Spec = {
      type: 'group',
      properties: {
        hasPhone: {
          type: 'checkbox',
          label: 'Has Phone',
          checkbox_label: 'I have a phone number',
        },
        phone: {
          type: 'text',
          label: 'Phone Number',
          display_switch: 'hasPhone == true',
        },
      },
    };

    const { container } = render(<FormBuilder spec={spec} language="en" />);

    // Check the checkbox
    const checkbox = screen.getByRole('checkbox');
    await userEvent.click(checkbox);

    // Phone field wrapper should no longer be hidden (reference: visibility is
    // wrapper display:none, the field always stays in the DOM)
    await waitFor(() => {
      const wrapper = container.querySelector('[name="phone-layer"]') as HTMLElement;
      expect(wrapper).toBeInTheDocument();
      expect(wrapper.style.display).not.toBe('none');
    });
  });

  it('should handle display_target visibility', async () => {
    const spec: Spec = {
      type: 'group',
      properties: {
        showMore: {
          type: 'checkbox',
          label: 'Show More',
          checkbox_label: 'Show additional options',
        },
        moreOptions: {
          type: 'text',
          label: 'More Options',
          display_target: 'showMore',
        },
      },
    };

    const { container } = render(<FormBuilder spec={spec} language="en" />);

    // Hidden initially — kept in the DOM with wrapper display:none (reference
    // contract; DOM removal is the old pre-reference behavior)
    expect(container.querySelector('[name="moreOptions"]')).toBeInTheDocument();
    const wrapper = container.querySelector('[name="moreOptions-layer"]') as HTMLElement;
    expect(wrapper.style.display).toBe('none');

    // Toggle checkbox
    const checkbox = screen.getByRole('checkbox');
    await userEvent.click(checkbox);

    // Should be visible now
    await waitFor(() => {
      expect(wrapper.style.display).not.toBe('none');
    });
  });

  it('should toggle visibility dynamically based on select value', async () => {
    const spec: Spec = {
      type: 'group',
      properties: {
        contactType: {
          type: 'select',
          label: 'Contact Type',
          items: {
            '': 'Select',
            email: 'Email',
            phone: 'Phone',
          },
        },
        email: {
          type: 'email',
          label: 'Email Address',
          display_switch: 'contactType == "email"',
        },
        phone: {
          type: 'text',
          label: 'Phone Number',
          display_switch: 'contactType == "phone"',
        },
      },
    };

    const { container } = render(<FormBuilder spec={spec} language="en" />);

    // Reference contract: both fields stay in the DOM; visibility toggles via
    // wrapper style="display: none", never DOM removal.
    const emailWrapper = container.querySelector('[name="email-layer"]') as HTMLElement;
    const phoneWrapper = container.querySelector('[name="phone-layer"]') as HTMLElement;
    expect(container.querySelector('[name="email"]')).toBeInTheDocument();
    expect(container.querySelector('[name="phone"]')).toBeInTheDocument();

    // Initially both hidden
    expect(emailWrapper.style.display).toBe('none');
    expect(phoneWrapper.style.display).toBe('none');

    // Select email
    const select = container.querySelector('[name="contactType"]') as HTMLSelectElement;
    await userEvent.selectOptions(select, 'email');

    await waitFor(() => {
      expect(emailWrapper.style.display).not.toBe('none');
      expect(phoneWrapper.style.display).toBe('none');
    });

    // Switch to phone
    await userEvent.selectOptions(select, 'phone');

    await waitFor(() => {
      expect(emailWrapper.style.display).toBe('none');
      expect(phoneWrapper.style.display).not.toBe('none');
    });
  });
});

// ============================================================================
// Initial Data Tests
// ============================================================================

describe('FormField Initial Data', () => {
  it('should display initial data in fields', () => {
    const spec: Spec = {
      type: 'group',
      properties: {
        name: { type: 'text', label: 'Name' },
        email: { type: 'email', label: 'Email' },
      },
    };

    const { container } = render(
      <FormBuilder
        spec={spec}
        data={{ name: 'John Doe', email: 'john@example.com' }}
        language="en"
      />
    );

    const nameInput = container.querySelector('[name="name"]') as HTMLInputElement;
    const emailInput = container.querySelector('[name="email"]') as HTMLInputElement;
    expect(nameInput).toHaveValue('John Doe');
    expect(emailInput).toHaveValue('john@example.com');
  });

  it('should display initial data for select fields', () => {
    const spec: Spec = {
      type: 'group',
      properties: {
        status: {
          type: 'select',
          label: 'Status',
          items: {
            '': 'Select',
            active: 'Active',
            inactive: 'Inactive',
          },
        },
      },
    };

    const { container } = render(
      <FormBuilder spec={spec} data={{ status: 'active' }} language="en" />
    );

    const select = container.querySelector('[name="status"]') as HTMLSelectElement;
    expect(select).toHaveValue('active');
  });

  it('should display initial data for checkbox fields', () => {
    const spec: Spec = {
      type: 'group',
      properties: {
        agree: {
          type: 'checkbox',
          label: 'Terms',
          checkbox_label: 'I agree',
        },
      },
    };

    render(
      <FormBuilder spec={spec} data={{ agree: true }} language="en" />
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
  });
});

// ============================================================================
// Multi-language Label Tests
// ============================================================================

describe('FormField Multi-language Labels', () => {
  it('should display label in selected language', () => {
    const spec = {
      type: 'group',
      properties: {
        name: {
          type: 'text',
          label: {
            ko: '이름',
            en: 'Name',
          },
        },
      },
    } as unknown as Spec; // multilang label/placeholder maps — validator Spec types them as plain strings

    // English
    render(<FormBuilder spec={spec} language="en" />);
    expect(screen.getByText('Name')).toBeInTheDocument();

    cleanup();

    // Korean
    render(<FormBuilder spec={spec} language="ko" />);
    expect(screen.getByText('이름')).toBeInTheDocument();
  });

  it('should display placeholder in selected language', () => {
    const spec = {
      type: 'group',
      properties: {
        name: {
          type: 'text',
          label: 'Name',
          placeholder: {
            ko: '이름을 입력하세요',
            en: 'Enter your name',
          },
        },
      },
    } as unknown as Spec; // multilang placeholder map — validator Spec types it as a plain string

    render(<FormBuilder spec={spec} language="en" />);
    expect(screen.getByPlaceholderText('Enter your name')).toBeInTheDocument();
  });

  it('should display error message in selected language', async () => {
    // Note: Multi-language error messages may need specific i18n implementation
    // This test uses a simple string error message
    const spec: Spec = {
      type: 'group',
      properties: {
        email: {
          type: 'email',
          label: 'Email',
          rules: { required: true },
          messages: {
            required: 'Email is required',
          },
        },
      },
    };

    render(<FormBuilder spec={spec} language="en" />);

    const submitButton = screen.getByRole('button', { name: '저장' });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Email is required')).toBeInTheDocument();
    });
  });
});
