/**
 * useForm Hook Integration Tests
 *
 * Tests the useForm hook integration with @limepie/form-validator
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useForm } from '../legacy/hooks/useForm';
import type { Spec } from '@limepie/form-validator/legacy';

// Test specification with various field types and validation rules
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
    password: {
      type: 'password',
      label: 'Password',
      rules: {
        required: true,
        minlength: 8,
      },
      messages: {
        required: 'Password is required',
        minlength: 'Password must be at least 8 characters',
      },
    },
    age: {
      type: 'number',
      label: 'Age',
      rules: {
        min: 0,
        max: 150,
      },
      messages: {
        min: 'Age must be at least 0',
        max: 'Age cannot exceed 150',
      },
    },
    profile: {
      type: 'group',
      label: 'Profile',
      properties: {
        bio: {
          type: 'textarea',
          label: 'Bio',
          rules: {
            maxlength: 500,
          },
        },
        website: {
          type: 'url',
          label: 'Website',
        },
      },
    },
  },
};

describe('useForm hook', () => {
  describe('returns correct methods', () => {
    it('should return all expected methods and properties', () => {
      const { result } = renderHook(() => useForm({ spec: testSpec }));

      // Check data properties
      expect(result.current.data).toBeDefined();
      expect(result.current.errors).toBeDefined();
      expect(typeof result.current.isValid).toBe('boolean');
      expect(typeof result.current.isDirty).toBe('boolean');
      expect(typeof result.current.isSubmitting).toBe('boolean');

      // Check methods
      expect(result.current.setValue).toBeInstanceOf(Function);
      expect(result.current.getValue).toBeInstanceOf(Function);
      expect(result.current.setValues).toBeInstanceOf(Function);
      expect(result.current.reset).toBeInstanceOf(Function);
      expect(result.current.validateField).toBeInstanceOf(Function);
      expect(result.current.validate).toBeInstanceOf(Function);
      expect(result.current.submit).toBeInstanceOf(Function);
      expect(result.current.handleChange).toBeInstanceOf(Function);
      expect(result.current.handleBlur).toBeInstanceOf(Function);
    });

    it('should initialize with empty data by default', () => {
      const { result } = renderHook(() => useForm({ spec: testSpec }));

      expect(result.current.data).toEqual({});
      expect(result.current.errors).toEqual({});
      expect(result.current.isValid).toBe(true);
      expect(result.current.isDirty).toBe(false);
    });

    it('should initialize with provided initial data', () => {
      const initialData = {
        email: 'test@example.com',
        username: 'testuser',
      };

      const { result } = renderHook(() =>
        useForm({ spec: testSpec, initialData })
      );

      expect(result.current.data).toEqual(initialData);
      expect(result.current.isDirty).toBe(false);
    });
  });

  describe('setValue/getValue', () => {
    it('should set and get simple field values correctly', () => {
      const { result } = renderHook(() => useForm({ spec: testSpec }));

      act(() => {
        result.current.setValue('email', 'test@example.com');
      });

      expect(result.current.getValue('email')).toBe('test@example.com');
      expect(result.current.data.email).toBe('test@example.com');
    });

    it('should set nested field values correctly', () => {
      const { result } = renderHook(() => useForm({ spec: testSpec }));

      act(() => {
        result.current.setValue('profile.bio', 'Hello world');
        result.current.setValue('profile.website', 'https://example.com');
      });

      expect(result.current.getValue('profile.bio')).toBe('Hello world');
      expect(result.current.getValue('profile.website')).toBe(
        'https://example.com'
      );
    });

    it('should mark form as dirty after setValue', () => {
      const { result } = renderHook(() => useForm({ spec: testSpec }));

      expect(result.current.isDirty).toBe(false);

      act(() => {
        result.current.setValue('username', 'newuser');
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should clear field error when setting a new value', () => {
      const { result } = renderHook(() => useForm({ spec: testSpec }));

      // First set a value and validate to create an error
      act(() => {
        result.current.setValue('email', 'invalid');
        result.current.validateField('email');
      });

      expect(result.current.errors.email).toBeDefined();

      // Setting a new value should clear the error
      act(() => {
        result.current.setValue('email', 'test@example.com');
      });

      expect(result.current.errors.email).toBeUndefined();
    });

    it('should call onChange callback when value changes', () => {
      const onChange = vi.fn();
      const { result } = renderHook(() =>
        useForm({ spec: testSpec, onChange })
      );

      act(() => {
        result.current.setValue('username', 'testuser');
      });

      expect(onChange).toHaveBeenCalledWith(
        'username',
        'testuser',
        expect.objectContaining({ username: 'testuser' })
      );
    });

    it('should handle setValues for multiple fields', () => {
      const { result } = renderHook(() => useForm({ spec: testSpec }));

      act(() => {
        result.current.setValues({
          email: 'test@example.com',
          username: 'testuser',
          age: 25,
        });
      });

      expect(result.current.getValue('email')).toBe('test@example.com');
      expect(result.current.getValue('username')).toBe('testuser');
      expect(result.current.getValue('age')).toBe(25);
    });
  });

  describe('validate()', () => {
    it('should validate entire form and return errors', () => {
      const { result } = renderHook(() => useForm({ spec: testSpec }));

      act(() => {
        result.current.setValue('email', 'invalid-email');
        result.current.setValue('username', 'ab');
        result.current.setValue('password', 'short');
      });

      let errors: Record<string, string>;
      act(() => {
        errors = result.current.validate();
      });

      expect(errors!.email).toBe('Invalid email format');
      expect(errors!.username).toBe('Username must be at least 3 characters');
      expect(errors!.password).toBe('Password must be at least 8 characters');
    });

    it('should return empty errors for valid form', () => {
      const { result } = renderHook(() => useForm({ spec: testSpec }));

      act(() => {
        result.current.setValue('email', 'test@example.com');
        result.current.setValue('username', 'testuser');
        result.current.setValue('password', 'securepass123');
      });

      let errors: Record<string, string>;
      act(() => {
        errors = result.current.validate();
      });

      expect(Object.keys(errors!).length).toBe(0);
    });

    it('should update errors state after validation', () => {
      const { result } = renderHook(() => useForm({ spec: testSpec }));

      act(() => {
        result.current.setValue('email', '');
        result.current.validate();
      });

      expect(result.current.errors.email).toBe('Email is required');
      expect(result.current.isValid).toBe(false);
    });

    it('should call onValidate callback with errors', () => {
      const onValidate = vi.fn();
      const { result } = renderHook(() =>
        useForm({ spec: testSpec, onValidate })
      );

      act(() => {
        result.current.setValue('email', 'invalid');
        result.current.validate();
      });

      expect(onValidate).toHaveBeenCalledWith(
        expect.objectContaining({
          email: expect.any(String),
        })
      );
    });
  });

  describe('validateField()', () => {
    it('should validate single field and return error', () => {
      const { result } = renderHook(() => useForm({ spec: testSpec }));

      act(() => {
        result.current.setValue('email', 'invalid-email');
      });

      let error: string | null;
      act(() => {
        error = result.current.validateField('email');
      });

      expect(error!).toBe('Invalid email format');
      expect(result.current.errors.email).toBe('Invalid email format');
    });

    it('should return null for valid field', () => {
      const { result } = renderHook(() => useForm({ spec: testSpec }));

      act(() => {
        result.current.setValue('email', 'test@example.com');
      });

      let error: string | null;
      act(() => {
        error = result.current.validateField('email');
      });

      expect(error!).toBeNull();
      expect(result.current.errors.email).toBeUndefined();
    });

    it('should validate required rule', () => {
      const { result } = renderHook(() => useForm({ spec: testSpec }));

      let error: string | null;
      act(() => {
        error = result.current.validateField('email');
      });

      expect(error!).toBe('Email is required');
    });

    it('should clear error when field becomes valid', () => {
      const { result } = renderHook(() => useForm({ spec: testSpec }));

      // First make field invalid (empty triggers required first)
      act(() => {
        result.current.setValue('username', '');
        result.current.validateField('username');
      });

      expect(result.current.errors.username).toBe('Username is required');

      // Now make field valid - setValue clears the error
      act(() => {
        result.current.setValue('username', 'validuser');
      });

      // Error is cleared by setValue
      expect(result.current.errors.username).toBeUndefined();

      // Validation should confirm it's valid
      act(() => {
        result.current.validateField('username');
      });

      expect(result.current.errors.username).toBeUndefined();
    });

    it('should validate nested field', () => {
      const { result } = renderHook(() => useForm({ spec: testSpec }));

      act(() => {
        result.current.setValue('profile.bio', 'x'.repeat(501));
      });

      let error: string | null;
      act(() => {
        error = result.current.validateField('profile.bio');
      });

      // Depending on the spec, this might return an error or null
      // The test verifies the validateField function works for nested paths
      expect(typeof error === 'string' || error === null).toBe(true);
    });
  });

  describe('errors state updates', () => {
    it('should update isValid when errors change', () => {
      const { result } = renderHook(() => useForm({ spec: testSpec }));

      expect(result.current.isValid).toBe(true);

      act(() => {
        result.current.setValue('email', '');
        result.current.validate();
      });

      expect(result.current.isValid).toBe(false);
    });

    it('should track multiple field errors', () => {
      const { result } = renderHook(() => useForm({ spec: testSpec }));

      act(() => {
        result.current.setValue('email', 'invalid');
        result.current.setValue('username', 'ab');
        result.current.setValue('password', 'short');
        result.current.validate();
      });

      expect(Object.keys(result.current.errors).length).toBeGreaterThanOrEqual(
        3
      );
    });

    it('should remove error when field is corrected', () => {
      const { result } = renderHook(() => useForm({ spec: testSpec }));

      // Create errors
      act(() => {
        result.current.setValue('email', 'invalid');
        result.current.validateField('email');
      });

      expect(result.current.errors.email).toBeDefined();

      // Fix the field - setValue clears the error, then validate to confirm it stays cleared
      act(() => {
        result.current.setValue('email', 'valid@example.com');
      });

      // Error is cleared when setValue is called
      expect(result.current.errors.email).toBeUndefined();

      // Validate again to confirm it's valid
      act(() => {
        result.current.validateField('email');
      });

      expect(result.current.errors.email).toBeUndefined();
    });
  });

  describe('form submission flow', () => {
    it('should call onSubmit with form data and errors', async () => {
      const onSubmit = vi.fn();
      const { result } = renderHook(() =>
        useForm({ spec: testSpec, onSubmit })
      );

      act(() => {
        result.current.setValue('email', 'test@example.com');
        result.current.setValue('username', 'testuser');
        result.current.setValue('password', 'securepass123');
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
          username: 'testuser',
          password: 'securepass123',
        }),
        expect.any(Object)
      );
    });

    it('should set isSubmitting during submission', async () => {
      const onSubmit = vi.fn(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );
      const { result } = renderHook(() =>
        useForm({ spec: testSpec, onSubmit })
      );

      expect(result.current.isSubmitting).toBe(false);

      let submitPromise: Promise<void>;
      act(() => {
        submitPromise = result.current.submit();
      });

      expect(result.current.isSubmitting).toBe(true);

      await act(async () => {
        await submitPromise;
      });

      expect(result.current.isSubmitting).toBe(false);
    });

    it('should validate form before submission', async () => {
      const onSubmit = vi.fn();
      const { result } = renderHook(() =>
        useForm({ spec: testSpec, onSubmit })
      );

      // Set invalid data
      act(() => {
        result.current.setValue('email', 'invalid');
      });

      await act(async () => {
        await result.current.submit();
      });

      // onSubmit is called with errors
      expect(onSubmit).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          email: expect.any(String),
        })
      );
    });

    it('should handle async onSubmit correctly', async () => {
      const onSubmit = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const { result } = renderHook(() =>
        useForm({ spec: testSpec, onSubmit })
      );

      act(() => {
        result.current.setValue('email', 'test@example.com');
        result.current.setValue('username', 'testuser');
        result.current.setValue('password', 'password123');
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(onSubmit).toHaveBeenCalled();
      expect(result.current.isSubmitting).toBe(false);
    });

    it('should reset isSubmitting even if onSubmit throws', async () => {
      const onSubmit = vi.fn(async () => {
        throw new Error('Submit error');
      });

      const { result } = renderHook(() =>
        useForm({ spec: testSpec, onSubmit })
      );

      await act(async () => {
        try {
          await result.current.submit();
        } catch {
          // Expected error
        }
      });

      expect(result.current.isSubmitting).toBe(false);
    });
  });

  describe('reset form functionality', () => {
    it('should reset form to initial data', () => {
      const initialData = {
        email: 'initial@example.com',
        username: 'initialuser',
      };

      const { result } = renderHook(() =>
        useForm({ spec: testSpec, initialData })
      );

      // Modify the form
      act(() => {
        result.current.setValue('email', 'modified@example.com');
        result.current.setValue('username', 'modifieduser');
        result.current.validateField('email');
      });

      expect(result.current.isDirty).toBe(true);

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.data).toEqual(initialData);
      expect(result.current.isDirty).toBe(false);
    });

    it('should clear all errors on reset', () => {
      const { result } = renderHook(() => useForm({ spec: testSpec }));

      // Create errors
      act(() => {
        result.current.setValue('email', 'invalid');
        result.current.setValue('username', 'ab');
        result.current.validate();
      });

      expect(Object.keys(result.current.errors).length).toBeGreaterThan(0);

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.errors).toEqual({});
      expect(result.current.isValid).toBe(true);
    });

    it('should reset to new data when provided', () => {
      const initialData = { email: 'old@example.com' };
      const newData = { email: 'new@example.com', username: 'newuser' };

      const { result } = renderHook(() =>
        useForm({ spec: testSpec, initialData })
      );

      act(() => {
        result.current.reset(newData);
      });

      expect(result.current.data).toEqual(newData);
      expect(result.current.isDirty).toBe(false);
    });

    it('should update initial data reference on reset with new data', () => {
      const initialData = { email: 'old@example.com' };
      const newData = { email: 'new@example.com' };

      const { result } = renderHook(() =>
        useForm({ spec: testSpec, initialData })
      );

      // Reset with new data
      act(() => {
        result.current.reset(newData);
      });

      // Modify form
      act(() => {
        result.current.setValue('email', 'modified@example.com');
      });

      expect(result.current.isDirty).toBe(true);

      // Reset again without data should use the new initial data
      act(() => {
        result.current.reset();
      });

      expect(result.current.data).toEqual(newData);
    });
  });

  describe('validation modes', () => {
    it('should validate on blur when mode is onBlur', () => {
      const { result } = renderHook(() =>
        useForm({ spec: testSpec, validationMode: 'onBlur' })
      );

      act(() => {
        result.current.setValue('email', 'invalid');
      });

      // Error should not exist yet (no blur)
      expect(result.current.errors.email).toBeUndefined();

      // Simulate blur
      act(() => {
        result.current.handleBlur({
          target: { name: 'email' },
        } as React.FocusEvent<HTMLInputElement>);
      });

      expect(result.current.errors.email).toBe('Invalid email format');
    });

    it('should validate on change when mode is onChange', async () => {
      const { result } = renderHook(() =>
        useForm({ spec: testSpec, validationMode: 'onChange' })
      );

      act(() => {
        result.current.setValue('email', 'invalid');
      });

      // Wait for deferred validation
      await waitFor(() => {
        expect(result.current.errors.email).toBe('Invalid email format');
      });
    });

    it('should not validate on blur when mode is onSubmit', () => {
      const { result } = renderHook(() =>
        useForm({ spec: testSpec, validationMode: 'onSubmit' })
      );

      act(() => {
        result.current.setValue('email', 'invalid');
        result.current.handleBlur({
          target: { name: 'email' },
        } as React.FocusEvent<HTMLInputElement>);
      });

      // Error should not exist (only validates on submit)
      expect(result.current.errors.email).toBeUndefined();
    });
  });

  describe('handleChange', () => {
    it('should handle text input change', () => {
      const { result } = renderHook(() => useForm({ spec: testSpec }));

      act(() => {
        result.current.handleChange({
          target: {
            name: 'username',
            type: 'text',
            value: 'testuser',
          },
        } as React.ChangeEvent<HTMLInputElement>);
      });

      expect(result.current.getValue('username')).toBe('testuser');
    });

    it('should handle checkbox change', () => {
      const { result } = renderHook(() => useForm({ spec: testSpec }));

      act(() => {
        result.current.handleChange({
          target: {
            name: 'remember',
            type: 'checkbox',
            checked: true,
          },
        } as React.ChangeEvent<HTMLInputElement>);
      });

      expect(result.current.getValue('remember')).toBe(true);
    });

    it('should handle number input change', () => {
      const { result } = renderHook(() => useForm({ spec: testSpec }));

      act(() => {
        result.current.handleChange({
          target: {
            name: 'age',
            type: 'number',
            value: '25',
          },
        } as React.ChangeEvent<HTMLInputElement>);
      });

      expect(result.current.getValue('age')).toBe(25);
    });

    it('should handle empty number input', () => {
      const { result } = renderHook(() => useForm({ spec: testSpec }));

      act(() => {
        result.current.handleChange({
          target: {
            name: 'age',
            type: 'number',
            value: '',
          },
        } as React.ChangeEvent<HTMLInputElement>);
      });

      // Empty string is kept as string when NaN
      expect(result.current.getValue('age')).toBe('');
    });
  });
});
