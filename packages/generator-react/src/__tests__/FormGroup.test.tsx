/**
 * FormGroup Component Tests
 *
 * Tests for the FormGroup component that handles nested groups and multiple/sortable fields
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormBuilder } from '../legacy/components/FormBuilder';
import type { Spec } from '@form-spec/validator/legacy';

// ============================================================================
// Basic Group Rendering Tests
// ============================================================================

describe('FormGroup Component', () => {
  describe('single group rendering', () => {
    it('should render group with label', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          profile: {
            type: 'group',
            label: 'Profile Information',
            properties: {
              name: { type: 'text', label: 'Name' },
            },
          },
        },
      };

      const { container } = render(<FormBuilder spec={spec} language="en" />);

      expect(screen.getByText('Profile Information')).toBeInTheDocument();
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(container.querySelector('[name="profile[name]"]')).toBeInTheDocument();
    });

    it('should render group with description', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          settings: {
            type: 'group',
            label: 'Settings',
            description: 'Configure your preferences here',
            properties: {
              theme: { type: 'select', label: 'Theme' },
            },
          },
        },
      };

      render(<FormBuilder spec={spec} language="en" />);

      expect(screen.getByText('Configure your preferences here')).toBeInTheDocument();
    });

    it('should render nested fields within group', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          contact: {
            type: 'group',
            label: 'Contact Info',
            properties: {
              email: { type: 'email', label: 'Email' },
              phone: { type: 'text', label: 'Phone' },
              address: { type: 'textarea', label: 'Address' },
            },
          },
        },
      };

      const { container } = render(<FormBuilder spec={spec} language="en" />);

      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByText('Phone')).toBeInTheDocument();
      expect(screen.getByText('Address')).toBeInTheDocument();
      expect(container.querySelector('[name="contact[email]"]')).toBeInTheDocument();
      expect(container.querySelector('[name="contact[phone]"]')).toBeInTheDocument();
      expect(container.querySelector('[name="contact[address]"]')).toBeInTheDocument();
    });

    it('should handle nested groups', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          outer: {
            type: 'group',
            label: 'Outer Group',
            properties: {
              inner: {
                type: 'group',
                label: 'Inner Group',
                properties: {
                  field: { type: 'text', label: 'Nested Field' },
                },
              },
            },
          },
        },
      };

      const { container } = render(<FormBuilder spec={spec} language="en" />);

      expect(screen.getByText('Outer Group')).toBeInTheDocument();
      expect(screen.getByText('Inner Group')).toBeInTheDocument();
      expect(screen.getByText('Nested Field')).toBeInTheDocument();
      expect(container.querySelector('[name="outer[inner][field]"]')).toBeInTheDocument();
    });
  });

  describe('group data handling', () => {
    it('should display initial data in group fields', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          profile: {
            type: 'group',
            properties: {
              firstName: { type: 'text', label: 'First Name' },
              lastName: { type: 'text', label: 'Last Name' },
            },
          },
        },
      };

      const { container } = render(
        <FormBuilder
          spec={spec}
          data={{
            profile: {
              firstName: 'John',
              lastName: 'Doe',
            },
          }}
          language="en"
        />
      );

      const firstNameInput = container.querySelector('[name="profile[firstName]"]') as HTMLInputElement;
      const lastNameInput = container.querySelector('[name="profile[lastName]"]') as HTMLInputElement;
      expect(firstNameInput).toHaveValue('John');
      expect(lastNameInput).toHaveValue('Doe');
    });

    it('should collect nested group data on submit', async () => {
      const onSubmit = vi.fn();
      const spec: Spec = {
        type: 'group',
        properties: {
          profile: {
            type: 'group',
            properties: {
              name: { type: 'text', label: 'Name' },
              email: { type: 'email', label: 'Email' },
            },
          },
        },
      };

      const { container } = render(<FormBuilder spec={spec} language="en" onSubmit={onSubmit} />);

      const nameInput = container.querySelector('[name="profile[name]"]') as HTMLInputElement;
      const emailInput = container.querySelector('[name="profile[email]"]') as HTMLInputElement;
      await userEvent.type(nameInput, 'John Doe');
      await userEvent.type(emailInput, 'john@example.com');

      const submitButton = screen.getByRole('button', { name: '저장' });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled();
        const [data] = onSubmit.mock.calls[0];
        expect(data.profile.name).toBe('John Doe');
        expect(data.profile.email).toBe('john@example.com');
      });
    });

    it('should validate nested group fields', async () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          profile: {
            type: 'group',
            properties: {
              email: {
                type: 'email',
                label: 'Email',
                rules: { required: true },
                messages: { required: 'Email is required' },
              },
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
});

// ============================================================================
// Multiple Group (Array) Tests
// ============================================================================

// ============================================================================
// Multiple Group (Array) Tests
//
// Markup assertions follow the reference Limepie convention
// (tests/fixtures/reference-html/multiple-test.html):
//  - an EMPTY multiple group renders ONE blank placeholder row;
//  - each row is .form-element > .input-group-wrapper[data-uniqid=rowKey],
//    containing <div class="form-group">…fields…</div> followed by
//    <span class="btn-group input-group-btn"> with .btn-plus/.btn-minus
//    (+ .btn-move-up/.btn-move-down when sortable);
//  - field names embed the row key: items[__13hex__][name].
// ============================================================================

/** Rows of a multiple group = input-group-wrapper children of .form-element */
function getRows(container: HTMLElement, layerName: string): HTMLElement[] {
  return Array.from(
    container.querySelectorAll(`div[name="${layerName}"] > .form-element > .input-group-wrapper`)
  );
}

describe('Multiple FormGroup (Array Fields)', () => {
  describe('basic multiple group rendering (reference convention)', () => {
    const spec: Spec = {
      type: 'group',
      properties: {
        items: {
          type: 'group',
          label: 'Items',
          multiple: true,
          properties: {
            name: { type: 'text', label: 'Name' },
          },
        },
      },
    };

    it('should render one blank placeholder row with plus/minus buttons when empty', () => {
      const { container } = render(<FormBuilder spec={spec} language="en" />);

      expect(screen.getByText('Items')).toBeInTheDocument();

      const rows = getRows(container, 'items-layer');
      expect(rows).toHaveLength(1);

      // Blank row already contains the field input
      expect(rows[0]!.querySelector('input[data-name="name"]')).toBeInTheDocument();

      // Legacy button group: span.btn-group.input-group-btn > .btn-plus/.btn-minus
      const btnGroup = rows[0]!.querySelector('span.btn-group.input-group-btn');
      expect(btnGroup).toBeInTheDocument();
      expect(btnGroup!.querySelector('.btn-plus')).toBeInTheDocument();
      expect(btnGroup!.querySelector('.btn-minus')).toBeInTheDocument();
    });

    it('should embed the row key in field name and data-uniqid', () => {
      const { container } = render(<FormBuilder spec={spec} language="en" />);

      const row = getRows(container, 'items-layer')[0]!;
      const rowKey = row.getAttribute('data-uniqid')!;
      expect(rowKey).toMatch(/^__[a-z0-9]{13}__$/);

      const input = row.querySelector('input[data-name="name"]')!;
      expect(input.getAttribute('name')).toBe(`items[${rowKey}][name]`);
      expect(input.getAttribute('data-rule-name')).toBe('items[][name]');
    });

    it('should add a new row after the clicked row', async () => {
      const { container } = render(<FormBuilder spec={spec} language="en" />);

      await userEvent.click(container.querySelector('.btn-plus')!);

      await waitFor(() => {
        expect(getRows(container, 'items-layer')).toHaveLength(2);
      });

      // Second row gets the legacy clone-element class
      const rows = getRows(container, 'items-layer');
      expect(rows[0]!.classList.contains('clone-element')).toBe(false);
      expect(rows[1]!.classList.contains('clone-element')).toBe(true);
    });

    it('should add multiple rows', async () => {
      const { container } = render(<FormBuilder spec={spec} language="en" />);

      await userEvent.click(container.querySelector('.btn-plus')!);
      await waitFor(() => {
        expect(getRows(container, 'items-layer')).toHaveLength(2);
      });

      await userEvent.click(container.querySelectorAll('.btn-plus')[1]!);
      await waitFor(() => {
        expect(getRows(container, 'items-layer')).toHaveLength(3);
      });

      // Every row has its own button group
      expect(container.querySelectorAll('.btn-plus')).toHaveLength(3);
      expect(container.querySelectorAll('.btn-minus')).toHaveLength(3);
    });
  });

  describe('remove operation', () => {
    const spec: Spec = {
      type: 'group',
      properties: {
        items: {
          type: 'group',
          label: 'Items',
          multiple: true,
          properties: {
            name: { type: 'text', label: 'Name' },
          },
        },
      },
    };

    it('should remove the clicked row', async () => {
      const { container } = render(
        <FormBuilder
          spec={spec}
          data={{ items: [{ name: 'First' }, { name: 'Second' }] }}
          language="en"
        />
      );

      await waitFor(() => {
        expect(getRows(container, 'items-layer')).toHaveLength(2);
      });

      // Remove the first row
      await userEvent.click(container.querySelectorAll('.btn-minus')[0]!);

      await waitFor(() => {
        const inputs = container.querySelectorAll(
          'input[data-name="name"]'
        ) as NodeListOf<HTMLInputElement>;
        expect(inputs).toHaveLength(1);
        expect(inputs[0]).toHaveValue('Second');
      });
    });
  });

  describe('min/max constraints', () => {
    it('should not add beyond max', async () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          items: {
            type: 'group',
            label: 'Items',
            multiple: true,
            max: 2,
            properties: {
              name: { type: 'text', label: 'Name' },
            },
          },
        },
      };

      const { container } = render(<FormBuilder spec={spec} language="en" />);

      await userEvent.click(container.querySelector('.btn-plus')!);
      await waitFor(() => {
        expect(getRows(container, 'items-layer')).toHaveLength(2);
      });

      // At max — another click is a no-op (buttons stay rendered, reference style)
      await userEvent.click(container.querySelector('.btn-plus')!);
      await waitFor(() => {
        expect(getRows(container, 'items-layer')).toHaveLength(2);
      });
    });

    it('should not remove below min', async () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          items: {
            type: 'group',
            label: 'Items',
            multiple: true,
            min: 1,
            properties: {
              name: { type: 'text', label: 'Name' },
            },
          },
        },
      };

      const { container } = render(
        <FormBuilder spec={spec} data={{ items: [{ name: 'Keep me' }] }} language="en" />
      );

      await waitFor(() => {
        expect(getRows(container, 'items-layer')).toHaveLength(1);
      });

      await userEvent.click(container.querySelector('.btn-minus')!);

      await waitFor(() => {
        const input = container.querySelector('input[data-name="name"]') as HTMLInputElement;
        expect(input).toHaveValue('Keep me');
      });
    });
  });

  describe('data handling with multiple groups', () => {
    it('should display initial array data', async () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          contacts: {
            type: 'group',
            label: 'Contacts',
            multiple: true,
            properties: {
              name: { type: 'text', label: 'Name' },
              email: { type: 'email', label: 'Email' },
            },
          },
        },
      };

      const { container } = render(
        <FormBuilder
          spec={spec}
          data={{
            contacts: [
              { name: 'John', email: 'john@example.com' },
              { name: 'Jane', email: 'jane@example.com' },
            ],
          }}
          language="en"
        />
      );

      const nameInputs = container.querySelectorAll('input[data-name="name"]') as NodeListOf<HTMLInputElement>;
      const emailInputs = container.querySelectorAll('input[data-name="email"]') as NodeListOf<HTMLInputElement>;

      expect(nameInputs).toHaveLength(2);
      expect(nameInputs[0]).toHaveValue('John');
      expect(nameInputs[1]).toHaveValue('Jane');
      expect(emailInputs[0]).toHaveValue('john@example.com');
      expect(emailInputs[1]).toHaveValue('jane@example.com');
    });

    it('should collect array data on submit', async () => {
      const onSubmit = vi.fn();
      const spec: Spec = {
        type: 'group',
        properties: {
          tags: {
            type: 'group',
            label: 'Tags',
            multiple: true,
            properties: {
              value: { type: 'text', label: 'Value' },
            },
          },
        },
      };

      const { container } = render(
        <FormBuilder spec={spec} language="en" onSubmit={onSubmit} />
      );

      // Fill the placeholder row, then add a second row and fill it
      const firstInput = container.querySelector('[data-name="value"]') as HTMLInputElement;
      await userEvent.type(firstInput, 'tag1');

      await userEvent.click(container.querySelector('.btn-plus')!);
      await waitFor(() => {
        expect(container.querySelectorAll('[data-name="value"]')).toHaveLength(2);
      });

      const inputs = container.querySelectorAll('[data-name="value"]') as NodeListOf<HTMLInputElement>;
      await userEvent.type(inputs[1]!, 'tag2');

      // Submit
      const submitButton = screen.getByRole('button', { name: '저장' });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled();
        const [data] = onSubmit.mock.calls[0];
        // Data is stored with unique keys
        const tagsObject = data.tags;
        const tagValues = Object.values(tagsObject) as Array<{ value: string }>;
        expect(tagValues).toHaveLength(2);
        expect(tagValues.map((t) => t.value)).toContain('tag1');
        expect(tagValues.map((t) => t.value)).toContain('tag2');
      });
    });

    it('should validate array item fields', async () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          emails: {
            type: 'group',
            label: 'Emails',
            multiple: true,
            properties: {
              email: {
                type: 'email',
                label: 'Email',
                rules: { required: true, email: true },
                messages: {
                  required: 'Email is required',
                  email: 'Invalid email format',
                },
              },
            },
          },
        },
      };

      const { container } = render(<FormBuilder spec={spec} language="en" />);

      // Type invalid email into the placeholder row
      const emailInput = container.querySelector('[data-name="email"]') as HTMLInputElement;
      await userEvent.type(emailInput, 'invalid');

      // Submit form to trigger validation
      const submitButton = screen.getByRole('button', { name: '저장' });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid email format')).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // Edit-loss regression: FormContext data is the single source of truth.
  // Structural row operations (add/remove/move) MUST NOT overwrite values the
  // user edited — the old items[].value snapshot in useMultiple did exactly
  // that.
  // ==========================================================================
  describe('edited values survive row operations (regression)', () => {
    const spec: Spec = {
      type: 'group',
      properties: {
        items: {
          type: 'group',
          label: 'Items',
          multiple: true,
          sortable: true,
          properties: {
            name: { type: 'text', label: 'Name' },
          },
        },
      },
    };

    it('should keep an edited value when a row is added', async () => {
      const { container } = render(
        <FormBuilder spec={spec} data={{ items: [{ name: 'Original' }] }} language="en" />
      );

      const input = container.querySelector('input[data-name="name"]') as HTMLInputElement;
      await userEvent.clear(input);
      await userEvent.type(input, 'Edited');
      expect(input).toHaveValue('Edited');

      await userEvent.click(container.querySelector('.btn-plus')!);

      await waitFor(() => {
        const inputs = container.querySelectorAll(
          'input[data-name="name"]'
        ) as NodeListOf<HTMLInputElement>;
        expect(inputs).toHaveLength(2);
        expect(inputs[0]).toHaveValue('Edited');
      });
    });

    it('should keep edited values when another row is removed', async () => {
      const { container } = render(
        <FormBuilder
          spec={spec}
          data={{ items: [{ name: 'First' }, { name: 'Second' }] }}
          language="en"
        />
      );

      const inputs = () =>
        container.querySelectorAll('input[data-name="name"]') as NodeListOf<HTMLInputElement>;

      await userEvent.clear(inputs()[1]!);
      await userEvent.type(inputs()[1]!, 'Second edited');

      // Remove the FIRST row — the edit in the second row must survive
      await userEvent.click(container.querySelectorAll('.btn-minus')[0]!);

      await waitFor(() => {
        expect(inputs()).toHaveLength(1);
        expect(inputs()[0]).toHaveValue('Second edited');
      });
    });

    it('should keep edited values when rows are reordered', async () => {
      const { container } = render(
        <FormBuilder
          spec={spec}
          data={{ items: [{ name: 'First' }, { name: 'Second' }] }}
          language="en"
        />
      );

      const inputs = () =>
        container.querySelectorAll('input[data-name="name"]') as NodeListOf<HTMLInputElement>;

      await userEvent.clear(inputs()[0]!);
      await userEvent.type(inputs()[0]!, 'First edited');

      // Move the first row down
      await userEvent.click(container.querySelectorAll('.btn-move-down')[0]!);

      await waitFor(() => {
        expect(inputs()[0]).toHaveValue('Second');
        expect(inputs()[1]).toHaveValue('First edited');
      });
    });
  });

  describe('sortable multiple groups', () => {
    const spec: Spec = {
      type: 'group',
      properties: {
        items: {
          type: 'group',
          label: 'Items',
          multiple: true,
          sortable: true,
          properties: {
            name: { type: 'text', label: 'Name' },
          },
        },
      },
    };

    it('should render move buttons before plus/minus when sortable', () => {
      const { container } = render(<FormBuilder spec={spec} language="en" />);

      const btnGroup = container.querySelector('span.btn-group.input-group-btn')!;
      const classes = Array.from(btnGroup.querySelectorAll('button')).map((b) => b.className);
      expect(classes).toEqual([
        'btn btn-move-up',
        'btn btn-move-down',
        'btn btn-plus',
        'btn btn-minus',
      ]);
    });

    it('should move a row up', async () => {
      const { container } = render(
        <FormBuilder
          spec={spec}
          data={{ items: [{ name: 'A' }, { name: 'B' }] }}
          language="en"
        />
      );

      const inputs = () =>
        container.querySelectorAll('input[data-name="name"]') as NodeListOf<HTMLInputElement>;

      await userEvent.click(container.querySelectorAll('.btn-move-up')[1]!);

      await waitFor(() => {
        expect(inputs()[0]).toHaveValue('B');
        expect(inputs()[1]).toHaveValue('A');
      });
    });

    it('should ignore move up on the first row', async () => {
      const { container } = render(
        <FormBuilder
          spec={spec}
          data={{ items: [{ name: 'A' }, { name: 'B' }] }}
          language="en"
        />
      );

      const inputs = () =>
        container.querySelectorAll('input[data-name="name"]') as NodeListOf<HTMLInputElement>;

      await userEvent.click(container.querySelectorAll('.btn-move-up')[0]!);

      await waitFor(() => {
        expect(inputs()[0]).toHaveValue('A');
        expect(inputs()[1]).toHaveValue('B');
      });
    });
  });

  describe("multiple: 'only' (rows without buttons)", () => {
    it('should render data rows but no add/remove buttons', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          items: {
            type: 'group',
            label: 'Items',
            multiple: 'only' as unknown as boolean,
            properties: {
              name: { type: 'text', label: 'Name' },
            },
          },
        },
      };

      const { container } = render(
        <FormBuilder
          spec={spec}
          data={{ items: [{ name: 'Row 1' }, { name: 'Row 2' }] }}
          language="en"
        />
      );

      const inputs = container.querySelectorAll(
        'input[data-name="name"]'
      ) as NodeListOf<HTMLInputElement>;
      expect(inputs).toHaveLength(2);
      expect(inputs[0]).toHaveValue('Row 1');
      expect(inputs[1]).toHaveValue('Row 2');

      // Row keys still drive names (rule name uses empty brackets)
      expect(inputs[0]!.getAttribute('name')).toMatch(/^items\[__[a-z0-9]{13}__\]\[name\]$/);
      expect(inputs[0]!.getAttribute('data-rule-name')).toBe('items[][name]');

      // multiple: 'only' has NO buttons (legacy renders none)
      expect(container.querySelector('.btn-plus')).not.toBeInTheDocument();
      expect(container.querySelector('.btn-minus')).not.toBeInTheDocument();
      expect(container.querySelector('span.btn-group.input-group-btn')).not.toBeInTheDocument();
    });
  });

  describe('disabled/readonly state', () => {
    it('should not render add/remove buttons when form is disabled', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          items: {
            type: 'group',
            label: 'Items',
            multiple: true,
            properties: {
              name: { type: 'text', label: 'Name' },
            },
          },
        },
      };

      const { container } = render(
        <FormBuilder
          spec={spec}
          data={{
            items: [{ name: 'Item 1' }],
          }}
          disabled={true}
          language="en"
        />
      );

      // Add/remove buttons should not be visible when disabled
      expect(container.querySelector('.btn-plus')).not.toBeInTheDocument();
      expect(container.querySelector('.btn-minus')).not.toBeInTheDocument();
    });

    it('should not render add/remove buttons when form is readonly', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          items: {
            type: 'group',
            label: 'Items',
            multiple: true,
            properties: {
              name: { type: 'text', label: 'Name' },
            },
          },
        },
      };

      const { container } = render(
        <FormBuilder
          spec={spec}
          data={{
            items: [{ name: 'Item 1' }],
          }}
          readonly={true}
          language="en"
        />
      );

      // Add/remove buttons should not be visible when readonly
      expect(container.querySelector('.btn-plus')).not.toBeInTheDocument();
      expect(container.querySelector('.btn-minus')).not.toBeInTheDocument();
    });

    it('should disable fields in array items when form is disabled', async () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          items: {
            type: 'group',
            label: 'Items',
            multiple: true,
            properties: {
              name: { type: 'text', label: 'Name' },
            },
          },
        },
      };

      const { container } = render(
        <FormBuilder
          spec={spec}
          data={{
            items: [{ name: 'Item 1' }],
          }}
          disabled={true}
          language="en"
        />
      );

      const nameInput = container.querySelector('[data-name="name"]') as HTMLInputElement;
      expect(nameInput).toBeDisabled();
    });
  });
});

// ============================================================================
// Empty group (no properties) — legacy renders an empty form-group, no warning
// ============================================================================

describe('Group without properties', () => {
  it('should render an empty form-group without warning', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const spec: Spec = {
      type: 'group',
      properties: {
        placeholder_group: {
          type: 'group',
          label: 'Pending Group',
        },
      },
    };

    const { container } = render(<FormBuilder spec={spec} language="en" />);

    expect(screen.getByText('Pending Group')).toBeInTheDocument();
    const group = container.querySelector(
      'div[name="placeholder_group-layer"] .form-element .form-group'
    );
    expect(group).toBeInTheDocument();
    expect(group!.children).toHaveLength(0);

    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Unknown field type'));
    consoleSpy.mockRestore();
  });
});

// ============================================================================
// Complex Nested Multiple Groups Tests
// ============================================================================

describe('Complex Nested Multiple Groups', () => {
  it('should handle multiple groups within multiple groups', async () => {
    const spec: Spec = {
      type: 'group',
      properties: {
        orders: {
          type: 'group',
          label: 'Orders',
          multiple: true,
          properties: {
            orderId: { type: 'text', label: 'Order ID' },
            items: {
              type: 'group',
              label: 'Order Items',
              multiple: true,
              properties: {
                product: { type: 'text', label: 'Product' },
                quantity: { type: 'number', label: 'Quantity' },
              },
            },
          },
        },
      },
    };

    const { container } = render(<FormBuilder spec={spec} language="en" />);

    // Placeholder rows render immediately at both levels
    expect(container.querySelector('[data-name="orderId"]')).toBeInTheDocument();
    expect(screen.getByText('Order Items')).toBeInTheDocument();
    expect(container.querySelector('[data-name="product"]')).toBeInTheDocument();

    // Add an outer order row (first .btn-plus belongs to the inner items row,
    // DOM order: inner row buttons come before the outer row buttons)
    const outerPlus = Array.from(container.querySelectorAll('.btn-plus')).pop()!;
    await userEvent.click(outerPlus);

    await waitFor(() => {
      expect(container.querySelectorAll('[data-name="orderId"]')).toHaveLength(2);
      expect(container.querySelectorAll('[data-name="product"]').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('should correctly path nested array data', async () => {
    const onSubmit = vi.fn();
    const spec: Spec = {
      type: 'group',
      properties: {
        parent: {
          type: 'group',
          label: 'Parent',
          properties: {
            children: {
              type: 'group',
              label: 'Children',
              multiple: true,
              properties: {
                name: { type: 'text', label: 'Child Name' },
              },
            },
          },
        },
      },
    };

    const { container } = render(
      <FormBuilder spec={spec} language="en" onSubmit={onSubmit} />
    );

    // Fill the placeholder child row
    const nameInput = container.querySelector('[data-name="name"]') as HTMLInputElement;
    await userEvent.type(nameInput, 'Child 1');

    // Submit
    const submitButton = screen.getByRole('button', { name: '저장' });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
      const [data] = onSubmit.mock.calls[0];
      expect(data.parent).toBeDefined();
      expect(data.parent.children).toBeDefined();
      const children = Object.values(data.parent.children) as Array<{ name: string }>;
      expect(children[0]?.name).toBe('Child 1');
    });
  });
});
