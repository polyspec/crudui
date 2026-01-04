/**
 * useValidation Hook Tests
 *
 * Tests the validation hook integration with @legacy/form-validator
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useValidation } from '../legacy/hooks/useValidation';
import type { Spec } from '@legacy/form-validator/legacy';

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
    },
  },
};

describe('useValidation hook', () => {
  it('should return validation functions', () => {
    const { result } = renderHook(() => useValidation({ spec: testSpec }));

    expect(result.current.validateField).toBeInstanceOf(Function);
    expect(result.current.validateFields).toBeInstanceOf(Function);
    expect(result.current.validateForm).toBeInstanceOf(Function);
    expect(result.current.checkRule).toBeInstanceOf(Function);
  });

  it('should validate single field correctly', () => {
    const { result } = renderHook(() => useValidation({ spec: testSpec }));

    // Valid email
    expect(result.current.validateField('email', 'test@example.com')).toBeNull();

    // Invalid email format
    expect(result.current.validateField('email', 'invalid')).toBe(
      'Invalid email format'
    );

    // Empty required field
    expect(result.current.validateField('email', '')).toBe('Email is required');
  });

  it('should validate form data correctly', () => {
    const { result } = renderHook(() => useValidation({ spec: testSpec }));

    // Valid form
    const validErrors = result.current.validateForm({
      email: 'test@example.com',
      username: 'testuser',
      password: 'securepass123',
    });
    expect(Object.keys(validErrors).length).toBe(0);

    // Invalid form
    const invalidErrors = result.current.validateForm({
      email: '',
      username: 'ab',
      password: 'short',
    });
    expect(Object.keys(invalidErrors).length).toBeGreaterThan(0);
    expect(invalidErrors.email).toBe('Email is required');
    expect(invalidErrors.username).toBe('Username must be at least 3 characters');
  });

  it('should check individual rules', () => {
    const { result } = renderHook(() => useValidation({ spec: testSpec }));

    // Check required rule
    expect(result.current.checkRule('required', '', true)).toBe(false);
    expect(result.current.checkRule('required', 'value', true)).toBe(true);

    // Check email rule
    expect(result.current.checkRule('email', 'test@example.com', true)).toBe(true);
    expect(result.current.checkRule('email', 'invalid', true)).toBe(false);

    // Check minlength rule
    expect(result.current.checkRule('minlength', 'ab', 3)).toBe(false);
    expect(result.current.checkRule('minlength', 'abc', 3)).toBe(true);
  });

  it('should validate multiple fields at once', () => {
    const { result } = renderHook(() => useValidation({ spec: testSpec }));

    const errors = result.current.validateFields({
      email: 'invalid-email',
      username: 'ab',
    });

    expect(errors.email).toBe('Invalid email format');
    expect(errors.username).toBe('Username must be at least 3 characters');
  });
});
