/**
 * Node.js Validation Example
 *
 * This example demonstrates how to use the form-generator validator
 * in a Node.js/Express backend for server-side validation.
 */

import { Validator, createValidator } from '@crudui/validator/legacy';
import type { Spec, ValidationResult, RuleFn } from '@crudui/validator/legacy';
import * as fs from 'fs';
import * as yaml from 'yaml';
import * as path from 'path';

// =============================================================================
// Basic Usage
// =============================================================================

/**
 * Basic validation example
 */
function basicExample() {
  // Define the form specification
  const spec: Spec = {
    type: 'group',
    properties: {
      email: {
        type: 'email',
        label: { ko: '이메일', en: 'Email' },
        rules: {
          required: true,
          email: true,
        },
        messages: {
          ko: {
            required: '이메일을 입력해주세요.',
            email: '올바른 이메일 형식으로 입력해주세요.',
          },
          en: {
            required: 'Email is required.',
            email: 'Please enter a valid email address.',
          },
        },
      },
      password: {
        type: 'password',
        label: { ko: '비밀번호', en: 'Password' },
        rules: {
          required: true,
          minlength: 8,
          match: '^(?=.*[A-Za-z])(?=.*\\d)[A-Za-z\\d@$!%*#?&]{8,}$',
        },
        messages: {
          ko: {
            required: '비밀번호를 입력해주세요.',
            minlength: '비밀번호는 최소 {0}자 이상이어야 합니다.',
            match: '비밀번호는 영문자와 숫자를 포함해야 합니다.',
          },
          en: {
            required: 'Password is required.',
            minlength: 'Password must be at least {0} characters.',
            match: 'Password must contain letters and numbers.',
          },
        },
      },
    },
  };

  // Create validator instance
  const validator = new Validator(spec);

  // Validate data
  const data = {
    email: 'invalid-email',
    password: '123',
  };

  const result = validator.validate(data);

  console.log('=== Basic Validation Example ===');
  console.log('Data:', data);
  console.log('Is Valid:', result.valid);
  console.log('Errors:', result.errors);
  console.log();
}

// =============================================================================
// Loading Spec from YAML File
// =============================================================================

/**
 * Load and validate using YAML spec file
 */
function yamlFileExample() {
  // Load spec from YAML file
  const specPath = path.join(__dirname, 'basic-form.yml');
  const specContent = fs.readFileSync(specPath, 'utf-8');
  const spec = yaml.parse(specContent) as Spec;

  // Create validator
  const validator = new Validator(spec);

  // Test data - valid
  const validData = {
    personal: {
      name: 'John Doe',
      email: 'john@example.com',
      phone: '010-1234-5678',
    },
    account: {
      username: 'johndoe123',
      password: 'SecurePass123',
    },
    newsletter: '1',
    terms: true,
  };

  // Test data - invalid
  const invalidData = {
    personal: {
      name: 'J', // Too short
      email: 'invalid', // Invalid email
      phone: '12345', // Invalid format
    },
    account: {
      username: 'jo', // Too short
      password: 'short', // Too short, no numbers
    },
    newsletter: '1',
    terms: false, // Required but false
  };

  console.log('=== YAML File Validation Example ===');
  console.log('Valid data result:', validator.validate(validData));
  console.log('Invalid data result:', validator.validate(invalidData));
  console.log();
}

// =============================================================================
// Conditional Required Validation
// =============================================================================

/**
 * Demonstrate conditional required field validation
 */
function conditionalRequiredExample() {
  const spec: Spec = {
    type: 'group',
    properties: {
      delivery_type: {
        type: 'choice',
        rules: { required: true },
      },
      // Address is required only when delivery_type is not 'pickup' (value 3)
      address: {
        type: 'group',
        properties: {
          street: {
            type: 'text',
            rules: {
              // Conditional required using expression
              required: '..delivery_type != 3',
            },
            messages: {
              en: { required: 'Street address is required for delivery.' },
            },
          },
          city: {
            type: 'text',
            rules: {
              required: '..delivery_type != 3',
            },
          },
          postal_code: {
            type: 'text',
            rules: {
              required: '..delivery_type != 3',
              match: '^[0-9]{5}$',
            },
          },
        },
      },
      // Pickup location is required only when delivery_type is 'pickup'
      pickup_location: {
        type: 'select',
        rules: {
          required: '.delivery_type == 3',
        },
        messages: {
          en: { required: 'Please select a pickup location.' },
        },
      },
    },
  };

  const validator = new Validator(spec);

  // Test case 1: Standard delivery without address (should fail)
  const deliveryNoAddress = {
    delivery_type: '1',
    address: {},
    pickup_location: '',
  };

  // Test case 2: Pickup without location (should fail)
  const pickupNoLocation = {
    delivery_type: '3',
    address: {},
    pickup_location: '',
  };

  // Test case 3: Standard delivery with address (should pass)
  const deliveryWithAddress = {
    delivery_type: '1',
    address: {
      street: '123 Main St',
      city: 'Seoul',
      postal_code: '12345',
    },
    pickup_location: '',
  };

  // Test case 4: Pickup with location (should pass)
  const pickupWithLocation = {
    delivery_type: '3',
    address: {},
    pickup_location: 'store1',
  };

  console.log('=== Conditional Required Example ===');
  console.log('Delivery without address:', validator.validate(deliveryNoAddress));
  console.log('Pickup without location:', validator.validate(pickupNoLocation));
  console.log('Delivery with address:', validator.validate(deliveryWithAddress));
  console.log('Pickup with location:', validator.validate(pickupWithLocation));
  console.log();
}

// =============================================================================
// Complex Expressions
// =============================================================================

/**
 * Demonstrate complex conditional expressions
 */
function complexExpressionsExample() {
  const spec: Spec = {
    type: 'group',
    properties: {
      product_type: {
        type: 'select',
        rules: { required: true },
      },
      is_digital: {
        type: 'choice',
        default: '0',
      },
      price: {
        type: 'number',
        rules: {
          // Required when not free (product_type != 'free')
          required: '.product_type != "free"',
          min: 0,
        },
      },
      // Shipping info required for physical products
      shipping: {
        type: 'group',
        properties: {
          weight: {
            type: 'number',
            rules: {
              // Required when: product is not free AND is not digital
              required: '..product_type != "free" && ..is_digital == 0',
            },
          },
          dimensions: {
            type: 'text',
            rules: {
              required: '..product_type != "free" && ..is_digital == 0',
            },
          },
        },
      },
      // Download URL required for digital products
      download_url: {
        type: 'text',
        rules: {
          required: '.product_type != "free" && .is_digital == 1',
          match: '^https?://',
        },
        messages: {
          en: {
            required: 'Download URL is required for digital products.',
            match: 'Please enter a valid URL starting with http:// or https://',
          },
        },
      },
    },
  };

  const validator = new Validator(spec);

  // Physical product
  const physicalProduct = {
    product_type: 'standard',
    is_digital: '0',
    price: 29.99,
    shipping: {
      weight: 0.5,
      dimensions: '10x10x5',
    },
    download_url: '',
  };

  // Digital product
  const digitalProduct = {
    product_type: 'standard',
    is_digital: '1',
    price: 9.99,
    shipping: {},
    download_url: 'https://example.com/download/file.zip',
  };

  // Free product (minimal requirements)
  const freeProduct = {
    product_type: 'free',
    is_digital: '1',
    price: 0,
    shipping: {},
    download_url: '',
  };

  console.log('=== Complex Expressions Example ===');
  console.log('Physical product:', validator.validate(physicalProduct));
  console.log('Digital product:', validator.validate(digitalProduct));
  console.log('Free product:', validator.validate(freeProduct));
  console.log();
}

// =============================================================================
// Nested Groups and Arrays
// =============================================================================

/**
 * Demonstrate nested groups and array validation
 */
function nestedGroupsExample() {
  const spec: Spec = {
    type: 'group',
    properties: {
      company: {
        type: 'group',
        properties: {
          name: {
            type: 'text',
            rules: { required: true, maxlength: 100 },
          },
          address: {
            type: 'group',
            properties: {
              street: { type: 'text', rules: { required: true } },
              city: { type: 'text', rules: { required: true } },
              country: { type: 'select', rules: { required: true } },
            },
          },
        },
      },
      // Array of employees
      'employees[]': {
        type: 'group',
        multiple: true,
        properties: {
          name: {
            type: 'text',
            rules: { required: true },
          },
          email: {
            type: 'email',
            rules: { required: true, email: true },
          },
          role: {
            type: 'select',
            rules: { required: true },
          },
        },
      },
      // Array of tags with unique constraint
      'tags[]': {
        type: 'text',
        multiple: true,
        rules: {
          unique: true,
          maxlength: 30,
        },
      },
    },
  };

  const validator = new Validator(spec);

  // Valid data
  const validData = {
    company: {
      name: 'Acme Corp',
      address: {
        street: '123 Business Ave',
        city: 'Seoul',
        country: 'KR',
      },
    },
    employees: [
      { name: 'John Doe', email: 'john@acme.com', role: 'developer' },
      { name: 'Jane Smith', email: 'jane@acme.com', role: 'designer' },
    ],
    tags: ['technology', 'software', 'startup'],
  };

  // Invalid data
  const invalidData = {
    company: {
      name: '', // Required
      address: {
        street: '123 Business Ave',
        city: '', // Required
        country: 'KR',
      },
    },
    employees: [
      { name: 'John Doe', email: 'invalid-email', role: 'developer' }, // Invalid email
      { name: '', email: 'jane@acme.com', role: '' }, // Missing name and role
    ],
    tags: ['technology', 'technology', 'startup'], // Duplicate
  };

  console.log('=== Nested Groups Example ===');
  console.log('Valid data:', validator.validate(validData));
  console.log('Invalid data:', validator.validate(invalidData));
  console.log();
}

// =============================================================================
// Custom Rules
// =============================================================================

/**
 * Demonstrate adding custom validation rules
 */
function customRulesExample() {
  const spec: Spec = {
    type: 'group',
    properties: {
      username: {
        type: 'text',
        rules: {
          required: true,
          // Custom rule: no_profanity (will be registered)
          no_profanity: true,
        },
        messages: {
          en: {
            no_profanity: 'Username contains inappropriate content.',
          },
        },
      },
      password: {
        type: 'password',
        rules: {
          required: true,
          minlength: 8,
        },
      },
      password_confirm: {
        type: 'password',
        rules: {
          required: true,
          // Custom rule: matches (will be registered)
          matches: 'password',
        },
        messages: {
          en: {
            matches: 'Passwords do not match.',
          },
        },
      },
      age: {
        type: 'number',
        rules: {
          required: true,
          // Custom rule: age_range
          age_range: { min: 18, max: 120 },
        },
        messages: {
          en: {
            age_range: 'Age must be between {0} and {1}.',
          },
        },
      },
    },
  };

  const validator = new Validator(spec);

  // Register custom rule: no_profanity
  validator.addRule('no_profanity', (value, param, allData, path) => {
    if (!value || typeof value !== 'string') return true;
    const profanityList = ['badword1', 'badword2', 'inappropriate'];
    const lowercaseValue = value.toLowerCase();
    return !profanityList.some((word) => lowercaseValue.includes(word));
  });

  // Register custom rule: matches (compare with another field)
  validator.addRule('matches', (value, param, allData, path) => {
    if (!param || typeof param !== 'string') return true;
    const otherValue = allData[param];
    return value === otherValue;
  });

  // Register custom rule: age_range
  validator.addRule('age_range', (value, param, allData, path) => {
    if (!value || typeof param !== 'object') return true;
    const age = parseInt(value as string);
    const { min, max } = param as { min: number; max: number };
    return age >= min && age <= max;
  });

  // Test data
  const validData = {
    username: 'gooduser123',
    password: 'SecurePass123',
    password_confirm: 'SecurePass123',
    age: 25,
  };

  const invalidData = {
    username: 'user_badword1_name',
    password: 'SecurePass123',
    password_confirm: 'DifferentPass456',
    age: 15,
  };

  console.log('=== Custom Rules Example ===');
  console.log('Valid data:', validator.validate(validData));
  console.log('Invalid data:', validator.validate(invalidData));
  console.log();
}

// =============================================================================
// Express.js Integration
// =============================================================================

/**
 * Example Express.js middleware for form validation
 */
function expressIntegrationExample() {
  // This is a code example - not executable without Express

  const exampleCode = `
import express from 'express';
import { Validator } from '@crudui/validator/legacy';
import * as yaml from 'yaml';
import * as fs from 'fs';

const app = express();
app.use(express.json());

// Middleware factory for form validation
function validateForm(specPath: string) {
  const specContent = fs.readFileSync(specPath, 'utf-8');
  const spec = yaml.parse(specContent);
  const validator = new Validator(spec);

  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const result = validator.validate(req.body);

    if (!result.valid) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: result.errors,
      });
    }

    // Attach validated data to request
    req.validatedData = req.body;
    next();
  };
}

// Usage in routes
app.post('/api/users', validateForm('./specs/user-registration.yml'), (req, res) => {
  // req.body has been validated
  const userData = req.validatedData;

  // Process registration...
  res.json({ success: true, message: 'User registered successfully' });
});

app.post('/api/products', validateForm('./specs/product-form.yml'), (req, res) => {
  const productData = req.validatedData;

  // Save product...
  res.json({ success: true, message: 'Product saved successfully' });
});

// Single field validation endpoint
app.post('/api/validate-field', (req, res) => {
  const { spec, path, value, allData } = req.body;

  const validator = new Validator(spec);
  const error = validator.validateField(path, value, allData);

  res.json({
    valid: error === null,
    error: error,
  });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
`;

  console.log('=== Express.js Integration Example ===');
  console.log('Example middleware code:');
  console.log(exampleCode);
  console.log();
}

// =============================================================================
// Single Field Validation
// =============================================================================

/**
 * Validate individual fields for real-time feedback
 */
function singleFieldValidationExample() {
  const spec: Spec = {
    type: 'group',
    properties: {
      email: {
        type: 'email',
        rules: { required: true, email: true },
        messages: {
          en: {
            required: 'Email is required.',
            email: 'Invalid email format.',
          },
        },
      },
      password: {
        type: 'password',
        rules: { required: true, minlength: 8 },
      },
      age: {
        type: 'number',
        rules: { required: true, min: 18, max: 120 },
      },
    },
  };

  const validator = new Validator(spec);

  // Simulate real-time validation as user types
  const simulatedInputs = [
    { path: 'email', value: '', allData: {} },
    { path: 'email', value: 'test', allData: { email: 'test' } },
    { path: 'email', value: 'test@', allData: { email: 'test@' } },
    { path: 'email', value: 'test@example.com', allData: { email: 'test@example.com' } },
    { path: 'password', value: '123', allData: { password: '123' } },
    { path: 'password', value: '12345678', allData: { password: '12345678' } },
    { path: 'age', value: '15', allData: { age: '15' } },
    { path: 'age', value: '25', allData: { age: '25' } },
  ];

  console.log('=== Single Field Validation Example ===');
  simulatedInputs.forEach(({ path, value, allData }) => {
    const error = validator.validateField(path, value, allData);
    console.log(`Field "${path}" = "${value}": ${error || 'Valid'}`);
  });
  console.log();
}

// =============================================================================
// Run All Examples
// =============================================================================

console.log('Form Generator - Node.js Validation Examples\n');
console.log('='.repeat(60));
console.log();

basicExample();
// yamlFileExample(); // Uncomment when YAML file exists
conditionalRequiredExample();
complexExpressionsExample();
nestedGroupsExample();
customRulesExample();
expressIntegrationExample();
singleFieldValidationExample();

console.log('='.repeat(60));
console.log('All examples completed.');
