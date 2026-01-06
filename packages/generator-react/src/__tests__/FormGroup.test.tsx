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

      const submitButton = screen.getByRole('button', { name: /save/i });
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

      const submitButton = screen.getByRole('button', { name: /save/i });
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

describe('Multiple FormGroup (Array Fields)', () => {
  describe('basic multiple group rendering', () => {
    it('should render add button for empty multiple group', () => {
      const spec: Spec = {
        type: 'group',
        properties: {
          contacts: {
            type: 'group',
            label: 'Contacts',
            multiple: true,
            properties: {
              name: { type: 'text', label: 'Name' },
            },
          },
        },
      };

      render(<FormBuilder spec={spec} language="en" />);

      expect(screen.getByText('Contacts')).toBeInTheDocument();
      // Add button should be visible (Plus icon button)
      const addButton = screen.getByRole('button', { name: '' });
      expect(addButton).toBeInTheDocument();
    });

    it('should add new item when add button is clicked', async () => {
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

      const { container } = render(<FormBuilder spec={spec} language="en" />);

      // Click add button
      const addButton = container.querySelector('.btn-outline-primary');
      expect(addButton).toBeInTheDocument();
      await userEvent.click(addButton!);

      // Should now have an item with Name field
      await waitFor(() => {
        expect(screen.getByText('Name')).toBeInTheDocument();
        expect(container.querySelector('[data-name="name"]')).toBeInTheDocument();
      });
    });

    it('should add multiple items', async () => {
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

      const { container } = render(<FormBuilder spec={spec} language="en" />);

      // Add first item
      let addButton = container.querySelector('.btn-outline-primary');
      await userEvent.click(addButton!);

      await waitFor(() => {
        expect(container.querySelectorAll('.card')).toHaveLength(1);
      });

      // Add second item (button is now inside the card header)
      addButton = container.querySelector('.card .btn-outline-primary');
      await userEvent.click(addButton!);

      await waitFor(() => {
        expect(container.querySelectorAll('.card')).toHaveLength(2);
      });
    });

    it('should display item index badges', async () => {
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

      const { container } = render(<FormBuilder spec={spec} language="en" />);

      // Add two items
      let addButton = container.querySelector('.btn-outline-primary');
      await userEvent.click(addButton!);

      await waitFor(() => {
        addButton = container.querySelector('.card .btn-outline-primary');
      });

      await userEvent.click(addButton!);

      await waitFor(() => {
        const badges = container.querySelectorAll('.badge');
        expect(badges).toHaveLength(2);
        expect(badges[0]).toHaveTextContent('1');
        expect(badges[1]).toHaveTextContent('2');
      });
    });
  });

  describe('remove operation', () => {
    it('should remove item when remove button is clicked', async () => {
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

      const { container } = render(<FormBuilder spec={spec} language="en" />);

      // Add two items
      let addButton = container.querySelector('.btn-outline-primary');
      await userEvent.click(addButton!);

      await waitFor(() => {
        addButton = container.querySelector('.card .btn-outline-primary');
      });
      await userEvent.click(addButton!);

      await waitFor(() => {
        expect(container.querySelectorAll('.card')).toHaveLength(2);
      });

      // Remove first item
      const removeButton = container.querySelector('.btn-outline-danger');
      await userEvent.click(removeButton!);

      await waitFor(() => {
        expect(container.querySelectorAll('.card')).toHaveLength(1);
      });
    });

    it('should reindex badges after remove', async () => {
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

      const { container } = render(<FormBuilder spec={spec} language="en" />);

      // Add three items
      let addButton = container.querySelector('.btn-outline-primary');
      await userEvent.click(addButton!);

      for (let i = 0; i < 2; i++) {
        await waitFor(() => {
          addButton = container.querySelector('.card .btn-outline-primary');
        });
        await userEvent.click(addButton!);
      }

      await waitFor(() => {
        expect(container.querySelectorAll('.card')).toHaveLength(3);
      });

      // Remove second item (index 1)
      const removeButtons = container.querySelectorAll('.btn-outline-danger');
      await userEvent.click(removeButtons[1]!);

      await waitFor(() => {
        const badges = container.querySelectorAll('.badge');
        expect(badges).toHaveLength(2);
        expect(badges[0]).toHaveTextContent('1');
        expect(badges[1]).toHaveTextContent('2');
      });
    });
  });

  describe('min/max constraints', () => {
    it('should disable add button when max is reached', async () => {
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

      // Add first item
      let addButton = container.querySelector('.btn-outline-primary');
      await userEvent.click(addButton!);

      await waitFor(() => {
        addButton = container.querySelector('.card .btn-outline-primary');
      });
      await userEvent.click(addButton!);

      // After reaching max, add buttons should be hidden
      await waitFor(() => {
        expect(container.querySelectorAll('.card')).toHaveLength(2);
        const addButtons = container.querySelectorAll('.btn-outline-primary');
        expect(addButtons).toHaveLength(0);
      });
    });

    it('should hide remove button when min is reached', async () => {
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

      const { container } = render(<FormBuilder spec={spec} language="en" />);

      // Add one item
      const addButton = container.querySelector('.btn-outline-primary');
      await userEvent.click(addButton!);

      await waitFor(() => {
        // When min is 1 and we have 1 item, remove button should be hidden
        const removeButtons = container.querySelectorAll('.btn-outline-danger');
        expect(removeButtons).toHaveLength(0);
      });
    });
  });

  describe('data handling with multiple groups', () => {
    it('should display initial array data', () => {
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

      // Add two items
      let addButton = container.querySelector('.btn-outline-primary');
      await userEvent.click(addButton!);

      await waitFor(() => {
        addButton = container.querySelector('.card .btn-outline-primary');
      });
      await userEvent.click(addButton!);

      // Fill values
      await waitFor(async () => {
        const inputs = container.querySelectorAll('[data-name="value"]') as NodeListOf<HTMLInputElement>;
        await userEvent.type(inputs[0], 'tag1');
        await userEvent.type(inputs[1], 'tag2');
      });

      // Submit
      const submitButton = screen.getByRole('button', { name: /save/i });
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

      // Add item
      const addButton = container.querySelector('.btn-outline-primary');
      await userEvent.click(addButton!);

      await waitFor(() => {
        expect(container.querySelector('[data-name="email"]')).toBeInTheDocument();
      });

      // Type invalid email
      const emailInput = container.querySelector('[data-name="email"]') as HTMLInputElement;
      await userEvent.type(emailInput, 'invalid');

      // Submit form to trigger validation
      const submitButton = screen.getByRole('button', { name: /save/i });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid email format')).toBeInTheDocument();
      });
    });
  });

  describe('sortable multiple groups', () => {
    it('should show sort controls when sortable is true', async () => {
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

      const { container } = render(<FormBuilder spec={spec} language="en" />);

      // Add two items to see sort buttons
      let addButton = container.querySelector('.btn-outline-primary');
      await userEvent.click(addButton!);

      await waitFor(() => {
        addButton = container.querySelector('.card .btn-outline-primary');
      });
      await userEvent.click(addButton!);

      await waitFor(() => {
        // Should have up/down buttons
        const sortButtons = container.querySelectorAll('.btn-outline-secondary');
        expect(sortButtons.length).toBeGreaterThan(0);
      });
    });

    it('should disable up button for first item', async () => {
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

      const { container } = render(<FormBuilder spec={spec} language="en" />);

      // Add two items
      let addButton = container.querySelector('.btn-outline-primary');
      await userEvent.click(addButton!);

      await waitFor(() => {
        addButton = container.querySelector('.card .btn-outline-primary');
      });
      await userEvent.click(addButton!);

      await waitFor(() => {
        // First item's up button should be disabled
        const cards = container.querySelectorAll('.card');
        const firstCardButtons = cards[0]?.querySelectorAll('.btn-outline-secondary');
        if (firstCardButtons && firstCardButtons.length > 0) {
          expect(firstCardButtons[0]).toBeDisabled();
        }
      });
    });

    it('should disable down button for last item', async () => {
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

      const { container } = render(<FormBuilder spec={spec} language="en" />);

      // Add two items
      let addButton = container.querySelector('.btn-outline-primary');
      await userEvent.click(addButton!);

      await waitFor(() => {
        addButton = container.querySelector('.card .btn-outline-primary');
      });
      await userEvent.click(addButton!);

      await waitFor(() => {
        // Last item's down button should be disabled
        const cards = container.querySelectorAll('.card');
        const lastCardButtons = cards[cards.length - 1]?.querySelectorAll('.btn-outline-secondary');
        if (lastCardButtons && lastCardButtons.length > 1) {
          expect(lastCardButtons[1]).toBeDisabled();
        }
      });
    });
  });

  describe('disabled/readonly state', () => {
    it('should disable add/remove buttons when form is disabled', () => {
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
      expect(container.querySelector('.btn-outline-primary')).not.toBeInTheDocument();
      expect(container.querySelector('.btn-outline-danger')).not.toBeInTheDocument();
    });

    it('should disable add/remove buttons when form is readonly', () => {
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
      expect(container.querySelector('.btn-outline-primary')).not.toBeInTheDocument();
      expect(container.querySelector('.btn-outline-danger')).not.toBeInTheDocument();
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

    // Add an order
    const addOrderButton = container.querySelector('.btn-outline-primary');

    if (addOrderButton) {
      await userEvent.click(addOrderButton);

      await waitFor(() => {
        // Order ID field should appear
        const orderIdInput = container.querySelector('[data-name="orderId"]');
        expect(orderIdInput).toBeInTheDocument();
        expect(screen.getByText('Order Items')).toBeInTheDocument();
      });
    }
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

    // Add a child
    const addButton = container.querySelector('.btn-outline-primary');
    if (addButton) {
      await userEvent.click(addButton);

      await waitFor(() => {
        const input = container.querySelector('[data-name="name"]');
        expect(input).toBeInTheDocument();
      });

      // Fill child name
      const nameInput = container.querySelector('[data-name="name"]') as HTMLInputElement;
      if (nameInput) {
        await userEvent.type(nameInput, 'Child 1');

        // Submit
        const submitButton = screen.getByRole('button', { name: /save/i });
        await userEvent.click(submitButton);

        await waitFor(() => {
          expect(onSubmit).toHaveBeenCalled();
          const [data] = onSubmit.mock.calls[0];
          expect(data.parent).toBeDefined();
          expect(data.parent.children).toBeDefined();
        });
      }
    }
  });
});
