/**
 * ProductNft Test Runner for JS Validator
 *
 * This script tests the JS validator against the ProductNft spec test cases.
 */

const fs = require('fs');
const path = require('path');

// Load the validator module
let Validator;
try {
  Validator = require('../validator/js/dist/index.js').Validator;
} catch (e) {
  console.error('Failed to load validator. Build the JS validator first with: cd validator/js && npm run build');
  process.exit(1);
}

// Load test cases
const testCasesPath = path.join(__dirname, 'cases/productnft.json');
const testData = JSON.parse(fs.readFileSync(testCasesPath, 'utf8'));

console.log(`\n${'='.repeat(70)}`);
console.log(`Running ProductNft Tests - JS Validator`);
console.log(`${'='.repeat(70)}\n`);

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

for (const test of testData.tests) {
  console.log(`\nTest: ${test.id} - ${test.description}`);
  console.log('-'.repeat(60));

  for (let i = 0; i < test.cases.length; i++) {
    const testCase = test.cases[i];
    totalTests++;

    try {
      // Convert spec format to Validator format
      const spec = convertSpec(test.spec);
      const validator = new Validator(spec);
      const result = validator.validate(testCase.input);

      // Check result
      const expectedValid = testCase.expected.valid;
      const actualValid = result.valid;

      let passed = expectedValid === actualValid;

      // Check error type if expected to be invalid
      if (!expectedValid && testCase.expected.error && !result.valid && result.errors.length > 0) {
        const expectedError = testCase.expected.error;
        const actualError = result.errors[0].rule;
        if (actualError !== expectedError) {
          passed = false;
        }
      }

      // Check field path if specified
      if (!expectedValid && testCase.expected.field && !result.valid && result.errors.length > 0) {
        const expectedField = testCase.expected.field;
        const actualField = result.errors[0].path;
        if (actualField !== expectedField) {
          passed = false;
        }
      }

      if (passed) {
        passedTests++;
        console.log(`  Case ${i + 1}: PASS`);
      } else {
        failedTests++;
        const failure = {
          testId: test.id,
          caseIndex: i + 1,
          input: testCase.input,
          expected: testCase.expected,
          actual: { valid: actualValid, errors: result.errors }
        };
        failures.push(failure);
        console.log(`  Case ${i + 1}: FAIL`);
        console.log(`    Expected: valid=${expectedValid}${testCase.expected.error ? `, error=${testCase.expected.error}` : ''}${testCase.expected.field ? `, field=${testCase.expected.field}` : ''}`);
        console.log(`    Actual: valid=${actualValid}${result.errors.length > 0 ? `, error=${result.errors[0].rule}, field=${result.errors[0].path}` : ''}`);
      }
    } catch (e) {
      failedTests++;
      failures.push({
        testId: test.id,
        caseIndex: i + 1,
        error: e.message
      });
      console.log(`  Case ${i + 1}: ERROR - ${e.message}`);
    }
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log(`RESULTS: ${passedTests}/${totalTests} passed, ${failedTests} failed`);
console.log(`${'='.repeat(70)}\n`);

if (failures.length > 0) {
  console.log('Failed Tests:');
  for (const f of failures) {
    console.log(`  - ${f.testId} Case ${f.caseIndex}${f.error ? ': ' + f.error : ''}`);
  }
}

// Convert test spec format to Validator format
function convertSpec(spec) {
  // The spec is already in the correct format for the JS validator
  // Just need to ensure properties are correctly structured
  return {
    type: spec.type || 'group',
    properties: convertProperties(spec.properties || {})
  };
}

function convertProperties(props) {
  const result = {};
  for (const [key, value] of Object.entries(props)) {
    result[key] = {
      ...value,
      properties: value.properties ? convertProperties(value.properties) : undefined
    };
  }
  return result;
}
