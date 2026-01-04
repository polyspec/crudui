/**
 * Integration Test: FormBuilder + Validator
 *
 * Verifies that the React FormBuilder correctly integrates with @legacy/form-validator
 */

import { describe, it, expect, vi } from 'vitest';
import { Validator, createValidator } from '@legacy/form-validator/legacy';
import { useValidation } from '../hooks/useValidation';
import type { Spec } from '@legacy/form-validator/legacy';

// Test spec for validation
const testSpec: Spec = {
  type: 'group',
  name: 'test_form',
  properties: {
    email: {
      type: 'email',
      label: 'Email',
      rules: {
        required: true,
        email: true,
      },
      messages: {
        required: 'Email is required',
        email: 'Invalid email format',
      },
    },
    username: {
      type: 'text',
      label: 'Username',
      rules: {
        required: true,
        minlength: 3,
        maxlength: 20,
      },
      messages: {
        required: 'Username is required',
        minlength: 'Username must be at least 3 characters',
        maxlength: 'Username cannot exceed 20 characters',
      },
    },
    age: {
      type: 'number',
      label: 'Age',
      rules: {
        min: 18,
        max: 100,
      },
      messages: {
        min: 'Must be at least 18 years old',
        max: 'Age cannot exceed 100',
      },
    },
    password: {
      type: 'password',
      label: 'Password',
      rules: {
        required: true,
        minlength: 8,
      },
    },
  },
};

describe('Validator Integration', () => {
  describe('Validator class', () => {
    it('should create a validator instance from spec', () => {
      const validator = new Validator(testSpec);
      expect(validator).toBeInstanceOf(Validator);
      expect(validator.getSpec()).toEqual(testSpec);
    });

    it('should use createValidator helper', () => {
      const validator = createValidator(testSpec);
      expect(validator).toBeInstanceOf(Validator);
    });
  });

  describe('Form Validation', () => {
    it('should validate empty form and return errors', () => {
      const validator = new Validator(testSpec);
      const result = validator.validate({});

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      // Check for required field errors
      const emailError = result.errors.find((e) => e.path === 'email');
      const usernameError = result.errors.find((e) => e.path === 'username');
      const passwordError = result.errors.find((e) => e.path === 'password');

      expect(emailError).toBeDefined();
      expect(emailError?.message).toBe('Email is required');

      expect(usernameError).toBeDefined();
      expect(usernameError?.message).toBe('Username is required');

      expect(passwordError).toBeDefined();
    });

    it('should validate valid form data and return no errors', () => {
      const validator = new Validator(testSpec);
      const result = validator.validate({
        email: 'test@example.com',
        username: 'testuser',
        age: 25,
        password: 'securepass123',
      });

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should validate email format', () => {
      const validator = new Validator(testSpec);
      const result = validator.validate({
        email: 'invalid-email',
        username: 'testuser',
        password: 'securepass123',
      });

      expect(result.valid).toBe(false);
      const emailError = result.errors.find((e) => e.path === 'email');
      expect(emailError).toBeDefined();
      expect(emailError?.message).toBe('Invalid email format');
    });

    it('should validate minlength rule', () => {
      const validator = new Validator(testSpec);
      const result = validator.validate({
        email: 'test@example.com',
        username: 'ab', // Too short
        password: 'securepass123',
      });

      expect(result.valid).toBe(false);
      const usernameError = result.errors.find((e) => e.path === 'username');
      expect(usernameError).toBeDefined();
      expect(usernameError?.message).toBe('Username must be at least 3 characters');
    });

    it('should validate min/max rules for numbers', () => {
      const validator = new Validator(testSpec);

      // Age too low
      let result = validator.validate({
        email: 'test@example.com',
        username: 'testuser',
        age: 15,
        password: 'securepass123',
      });

      expect(result.valid).toBe(false);
      let ageError = result.errors.find((e) => e.path === 'age');
      expect(ageError).toBeDefined();
      expect(ageError?.message).toBe('Must be at least 18 years old');

      // Age too high
      result = validator.validate({
        email: 'test@example.com',
        username: 'testuser',
        age: 150,
        password: 'securepass123',
      });

      expect(result.valid).toBe(false);
      ageError = result.errors.find((e) => e.path === 'age');
      expect(ageError).toBeDefined();
      expect(ageError?.message).toBe('Age cannot exceed 100');
    });
  });

  describe('Single Field Validation', () => {
    it('should validate single field', () => {
      const validator = new Validator(testSpec);

      // Valid email
      let error = validator.validateField('email', 'test@example.com', {});
      expect(error).toBeNull();

      // Invalid email
      error = validator.validateField('email', 'invalid', {});
      expect(error).toBe('Invalid email format');

      // Empty required field
      error = validator.validateField('email', '', {});
      expect(error).toBe('Email is required');
    });
  });

  describe('Custom Rules', () => {
    it('should allow adding custom rules', () => {
      const validator = new Validator({
        type: 'group',
        properties: {
          code: {
            type: 'text',
            rules: {
              custom_code: true,
            },
          },
        },
      });

      // Add custom rule
      validator.addRule('custom_code', (context) => {
        const value = context.value as string;
        if (!value || !/^[A-Z]{3}-\d{4}$/.test(value)) {
          return 'Code must be in format XXX-0000';
        }
        return null;
      });

      // Test invalid code
      let result = validator.validate({ code: 'invalid' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.message).toBe('Code must be in format XXX-0000');

      // Test valid code
      result = validator.validate({ code: 'ABC-1234' });
      expect(result.valid).toBe(true);
    });
  });
});

describe('Nested Group Validation', () => {
  const nestedSpec: Spec = {
    type: 'group',
    properties: {
      profile: {
        type: 'group',
        properties: {
          firstName: {
            type: 'text',
            rules: { required: true },
            messages: { required: 'First name is required' },
          },
          lastName: {
            type: 'text',
            rules: { required: true },
            messages: { required: 'Last name is required' },
          },
        },
      },
      contacts: {
        type: 'group',
        multiple: true,
        properties: {
          type: {
            type: 'select',
            rules: { required: true },
          },
          value: {
            type: 'text',
            rules: { required: true },
          },
        },
      },
    },
  };

  it('should validate nested group fields', () => {
    const validator = new Validator(nestedSpec);
    const result = validator.validate({
      profile: {},
    });

    expect(result.valid).toBe(false);

    const firstNameError = result.errors.find(
      (e) => e.path === 'profile.firstName'
    );
    expect(firstNameError).toBeDefined();
    expect(firstNameError?.message).toBe('First name is required');
  });

  it('should validate array group items', () => {
    const validator = new Validator(nestedSpec);
    const result = validator.validate({
      profile: {
        firstName: 'John',
        lastName: 'Doe',
      },
      contacts: [
        { type: '', value: '' },
        { type: 'email', value: '' },
      ],
    });

    expect(result.valid).toBe(false);

    // Check array item errors
    const contact0TypeError = result.errors.find(
      (e) => e.path === 'contacts.0.type'
    );
    const contact0ValueError = result.errors.find(
      (e) => e.path === 'contacts.0.value'
    );
    const contact1ValueError = result.errors.find(
      (e) => e.path === 'contacts.1.value'
    );

    expect(contact0TypeError).toBeDefined();
    expect(contact0ValueError).toBeDefined();
    expect(contact1ValueError).toBeDefined();
  });
});

describe('YAML Spec Parsing', () => {
  it('should work with YAML string spec in FormBuilder context', async () => {
    const yamlSpec = `
type: group
name: contact_form
properties:
  email:
    type: email
    label: Email
    rules:
      required: true
      email: true
    messages:
      required: Email is required
      email: Invalid email format
  message:
    type: textarea
    label: Message
    rules:
      required: true
      minlength: 10
`;

    // Import yaml to parse like FormBuilder does
    const yaml = await import('yaml');
    const parsedSpec = yaml.parse(yamlSpec) as Spec;

    const validator = new Validator(parsedSpec);

    // Test validation
    const result = validator.validate({
      email: 'test@example.com',
      message: 'Hello, this is a test message!',
    });

    expect(result.valid).toBe(true);

    // Test with invalid data
    const invalidResult = validator.validate({
      email: 'invalid',
      message: 'short',
    });

    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors.length).toBe(2);
  });
});
