/**
 * Validation Benchmarks
 *
 * Measures form validation performance including:
 * - ProductNft.yml (1,318 lines) full validation
 * - Single field validation
 * - Nested group validation
 * - Memory usage during validation
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { Validator } from '../src/Validator';
import { Spec } from '../src/types';
import {
  benchmark,
  printResult,
  printComparison,
  getMemoryUsage,
  getMemoryDiff,
  formatBytes,
  BenchmarkResult,
} from './index';

// Path to test fixtures
const FIXTURES_PATH = path.resolve(__dirname, '../../../tests/fixtures/specs');

/**
 * Load and parse a YAML spec file
 */
function loadSpec(filename: string): Spec {
  const filePath = path.join(FIXTURES_PATH, filename);
  const content = fs.readFileSync(filePath, 'utf-8');
  return yaml.parse(content) as Spec;
}

/**
 * Generate sample form data for ProductNft.yml
 */
function generateProductNftData(withErrors: boolean = false): Record<string, unknown> {
  return {
    common: {
      is_close: 0,
      is_display: 1,
      display: {
        start_dt: '2024-01-01 00:00:00',
        end_dt: '2024-12-31 23:59:59',
      },
      yoil: {
        is_allday: 0,
        'day[]': [],
      },
      is_sale: 1,
      sale: {
        start_dt: '2024-01-01 00:00:00',
        end_dt: '2024-12-31 23:59:59',
      },
      name: withErrors ? '' : 'Test Product Name',
      id: 'test-product-001',
      require_point_start: withErrors ? -100 : 0,
      require_point_end: 100000,
      max_quantity: 1,
      grade_number: withErrors ? 15 : 5,
      product_brand_seq: '',
      product_type_attribute_seq: 'test-type',
      product_type_attribute_items: {},
      product_attribute: 'Test attribute info',
      'category_seqs[]': ['cat1', 'cat2'],
      'sub_category_seqs[]': ['sub1'],
      'cover_images[]': ['image1.jpg'],
      product_attribute_image: '',
      short_description: 'Short desc',
      content: 'Full content',
      is_quantity: 1,
      is_option: 0,
    },
    option: {
      'groups[]': [],
      button: '',
    },
    option_multiplexable: {
      title: {},
      'items[]': {},
    },
    option_single: {
      title: {},
      'items[]': {
        is_close: 0,
        original_price: 10000,
        price: 9000,
        total_quantity: 100,
        rest_quantity: 50,
      },
    },
    option_multiple: {
      title: {},
      'items[]': [],
    },
    'additionals[]': [],
    'shipping_methods[]': ['shipping1'],
  };
}

/**
 * Generate minimal valid data for quick testing
 */
function generateMinimalData(): Record<string, unknown> {
  return {
    common: {
      is_close: 0,
      is_display: 1,
      name: 'Test',
      require_point_start: 0,
      require_point_end: 100,
      grade_number: 5,
      product_type_attribute_seq: 'test',
      product_attribute: 'test',
      'sub_category_seqs[]': ['sub1'],
      'cover_images[]': ['img.jpg'],
      is_option: 0,
    },
    option_single: {
      'items[]': {
        price: 1000,
      },
    },
    'shipping_methods[]': ['ship1'],
  };
}

/**
 * Run all validation benchmarks
 */
export async function runValidationBenchmarks(): Promise<void> {
  // Load ProductNft.yml spec
  let productNftSpec: Spec;
  try {
    productNftSpec = loadSpec('ProductNft.yml');
    console.log('\n  Loaded ProductNft.yml successfully');
  } catch (error) {
    console.error('\n  Failed to load ProductNft.yml:', error);
    console.log('  Creating a sample spec for benchmarking...');
    // Create a simpler spec for testing if the file doesn't exist
    productNftSpec = createSampleSpec();
  }

  // Generate test data
  const validData = generateProductNftData(false);
  const invalidData = generateProductNftData(true);
  const minimalData = generateMinimalData();

  // Benchmark 1: Validator instantiation
  console.log('\n  Running validator instantiation benchmark...');
  const instantiationResult = await benchmark(
    'Validator Instantiation',
    () => {
      new Validator(productNftSpec);
    },
    { iterations: 1000, measureMemory: true }
  );
  printResult(instantiationResult);

  // Benchmark 2: Full form validation (valid data)
  console.log('\n  Running full validation (valid data) benchmark...');
  const validator = new Validator(productNftSpec);
  const fullValidationValidResult = await benchmark(
    'Full Validation (Valid Data)',
    () => {
      validator.validate(validData);
    },
    { iterations: 100, measureMemory: true }
  );
  printResult(fullValidationValidResult);

  // Benchmark 3: Full form validation (invalid data)
  console.log('\n  Running full validation (invalid data) benchmark...');
  const fullValidationInvalidResult = await benchmark(
    'Full Validation (Invalid Data)',
    () => {
      validator.validate(invalidData);
    },
    { iterations: 100, measureMemory: true }
  );
  printResult(fullValidationInvalidResult);

  // Compare valid vs invalid data validation
  printComparison(fullValidationValidResult, fullValidationInvalidResult);

  // Benchmark 4: Single field validation
  console.log('\n  Running single field validation benchmark...');
  const singleFieldResult = await benchmark(
    'Single Field Validation',
    () => {
      validator.validateField('common.name', 'Test Product', validData);
    },
    { iterations: 1000 }
  );
  printResult(singleFieldResult);

  // Benchmark 5: Minimal data validation
  console.log('\n  Running minimal data validation benchmark...');
  const minimalResult = await benchmark(
    'Minimal Data Validation',
    () => {
      validator.validate(minimalData);
    },
    { iterations: 500 }
  );
  printResult(minimalResult);

  // Benchmark 6: Memory usage for 100 concurrent validations
  console.log('\n  Running memory benchmark (100 concurrent validations)...');
  const memoryBefore = getMemoryUsage();

  const validators: Validator[] = [];
  for (let i = 0; i < 100; i++) {
    validators.push(new Validator(productNftSpec));
  }

  const results = validators.map((v) => v.validate(validData));

  const memoryAfter = getMemoryUsage();
  const memDiff = getMemoryDiff(memoryBefore, memoryAfter);

  console.log('\n  Memory Usage (100 Validators + Validations):');
  console.log(`    Heap used:    ${formatBytes(memDiff.heapUsed)}`);
  console.log(`    Per instance: ${formatBytes(memDiff.heapUsed / 100)}`);
  console.log(`    Total valid:  ${results.filter((r) => r.valid).length}/100`);

  // Benchmark 7: Large dataset validation (array of items)
  console.log('\n  Running large dataset validation benchmark...');
  const largeDataSpec = createLargeArraySpec();
  const largeValidator = new Validator(largeDataSpec);
  const largeData = generateLargeArrayData(100);

  const largeDataResult = await benchmark(
    'Large Array Validation (100 items)',
    () => {
      largeValidator.validate(largeData);
    },
    { iterations: 50, measureMemory: true }
  );
  printResult(largeDataResult);
}

/**
 * Create a sample spec for testing when ProductNft.yml is not available
 */
function createSampleSpec(): Spec {
  return {
    type: 'group',
    properties: {
      common: {
        type: 'group',
        properties: {
          name: {
            type: 'text',
            rules: {
              required: true,
              minlength: 1,
              maxlength: 45,
            },
          },
          is_close: {
            type: 'choice',
            rules: {},
          },
          is_display: {
            type: 'choice',
            rules: {},
          },
          require_point_start: {
            type: 'number',
            rules: {
              required: true,
              min: 0,
              max: 100000000,
            },
          },
          require_point_end: {
            type: 'number',
            rules: {
              required: true,
              min: 0,
              max: 100000000,
            },
          },
          grade_number: {
            type: 'number',
            rules: {
              required: true,
              min: 1,
              max: 10,
            },
          },
          product_type_attribute_seq: {
            type: 'select',
            rules: {
              required: true,
            },
          },
          product_attribute: {
            type: 'textarea',
            rules: {
              required: true,
            },
          },
          'sub_category_seqs[]': {
            type: 'select',
            multiple: true,
            rules: {
              required: true,
              unique: true,
            },
          },
          'cover_images[]': {
            type: 'image',
            multiple: true,
            rules: {
              required: true,
            },
          },
          is_option: {
            type: 'choice',
            rules: {},
          },
        },
      },
      option_single: {
        type: 'group',
        properties: {
          'items[]': {
            type: 'group',
            multiple: 'only',
            properties: {
              price: {
                type: 'number',
                rules: {
                  required: 'common.is_option == 0',
                  min: 0,
                },
              },
            },
          },
        },
      },
      'shipping_methods[]': {
        type: 'select',
        multiple: true,
        rules: {
          required: true,
          unique: true,
        },
      },
    },
  };
}

/**
 * Create a spec with a large repeatable group for array validation testing
 */
function createLargeArraySpec(): Spec {
  return {
    type: 'group',
    properties: {
      items: {
        type: 'group',
        multiple: true,
        properties: {
          name: {
            type: 'text',
            rules: {
              required: true,
              minlength: 1,
              maxlength: 100,
            },
          },
          price: {
            type: 'number',
            rules: {
              required: true,
              min: 0,
              max: 1000000,
            },
          },
          quantity: {
            type: 'number',
            rules: {
              required: true,
              min: 1,
            },
          },
          description: {
            type: 'textarea',
            rules: {
              maxlength: 500,
            },
          },
          category: {
            type: 'select',
            rules: {
              required: true,
            },
          },
          tags: {
            type: 'text',
            rules: {},
          },
        },
      },
    },
  };
}

/**
 * Generate array data for large dataset testing
 */
function generateLargeArrayData(count: number): Record<string, unknown> {
  const items: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i++) {
    items.push({
      name: `Product ${i + 1}`,
      price: Math.floor(Math.random() * 100000),
      quantity: Math.floor(Math.random() * 100) + 1,
      description: `Description for product ${i + 1}`,
      category: `cat${(i % 5) + 1}`,
      tags: `tag${i}`,
    });
  }
  return { items };
}
