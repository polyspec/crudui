#!/usr/bin/env npx ts-node
/**
 * JavaScript/TypeScript Test Runner
 *
 * Loads test cases from tests/cases/*.json and validates using validator/js
 * Outputs colored pass/fail results and exits with error code if any fail.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Validator } from '../../validator/js/src/index';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

interface TestCase {
  input: unknown;
  expected: {
    valid: boolean;
    error?: string;
    field?: string;
  };
}

interface TestDefinition {
  id: string;
  description: string;
  spec: Record<string, unknown>;
  cases: TestCase[];
}

interface TestSuite {
  testSuite: string;
  version: string;
  description: string;
  tests: TestDefinition[];
}

interface TestResult {
  testId: string;
  caseIndex: number;
  passed: boolean;
  expected: TestCase['expected'];
  actual: {
    valid: boolean;
    error?: string;
    field?: string;
  };
  input: unknown;
}

/**
 * Convert spec from test format to Validator format
 * Handles both simple field specs and group specs with properties
 */
function convertSpec(spec: Record<string, unknown>): Record<string, unknown> {
  if (spec.type === 'group' && spec.properties) {
    return spec;
  }

  // Wrap simple field spec in a group with a 'value' property
  return {
    type: 'group',
    properties: {
      value: spec,
    },
  };
}

/**
 * Convert input data to match the spec structure
 */
function convertInput(spec: Record<string, unknown>, input: unknown): Record<string, unknown> {
  if (spec.type === 'group' && spec.properties) {
    return input as Record<string, unknown>;
  }

  // Handle special undefined marker
  if (input === '__undefined__') {
    return { value: undefined };
  }

  return { value: input };
}

/**
 * Run a single test case
 */
function runTestCase(
  testDef: TestDefinition,
  testCase: TestCase,
  caseIndex: number
): TestResult {
  const spec = convertSpec(testDef.spec);
  const input = convertInput(testDef.spec, testCase.input);

  const validator = new Validator(spec as any);
  const result = validator.validate(input);

  const actual: TestResult['actual'] = {
    valid: result.valid,
  };

  if (!result.valid && result.errors.length > 0) {
    const firstError = result.errors[0]!;
    actual.error = firstError.rule;
    actual.field = firstError.path;
  }

  // Determine if test passed
  let passed = actual.valid === testCase.expected.valid;

  if (!testCase.expected.valid && testCase.expected.error) {
    passed = passed && actual.error === testCase.expected.error;
  }

  if (!testCase.expected.valid && testCase.expected.field) {
    passed = passed && actual.field === testCase.expected.field;
  }

  return {
    testId: testDef.id,
    caseIndex,
    passed,
    expected: testCase.expected,
    actual,
    input: testCase.input,
  };
}

/**
 * Run all tests in a suite
 */
function runTestSuite(suite: TestSuite): TestResult[] {
  const results: TestResult[] = [];

  for (const testDef of suite.tests) {
    for (let i = 0; i < testDef.cases.length; i++) {
      const testCase = testDef.cases[i]!;
      const result = runTestCase(testDef, testCase, i);
      results.push(result);
    }
  }

  return results;
}

/**
 * Format input for display
 */
function formatInput(input: unknown): string {
  if (input === null) return 'null';
  if (input === undefined) return 'undefined';
  if (input === '__undefined__') return 'undefined';
  if (typeof input === 'string') {
    if (input === '') return '""';
    if (/^\s+$/.test(input)) return JSON.stringify(input);
    return `"${input}"`;
  }
  if (typeof input === 'object') {
    return JSON.stringify(input);
  }
  return String(input);
}

/**
 * Print test results
 */
function printResults(suiteName: string, results: TestResult[]): void {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log('');
  console.log(`${colors.bold}${colors.blue}=== ${suiteName} ===${colors.reset}`);
  console.log('');

  // Group results by test ID
  const groupedResults = new Map<string, TestResult[]>();
  for (const result of results) {
    const existing = groupedResults.get(result.testId) ?? [];
    existing.push(result);
    groupedResults.set(result.testId, existing);
  }

  for (const [testId, testResults] of groupedResults) {
    const allPassed = testResults.every((r) => r.passed);
    const icon = allPassed ? `${colors.green}[PASS]${colors.reset}` : `${colors.red}[FAIL]${colors.reset}`;

    console.log(`  ${icon} ${testId}`);

    // Show failed cases
    for (const result of testResults) {
      if (!result.passed) {
        console.log(`    ${colors.gray}Case ${result.caseIndex + 1}:${colors.reset}`);
        console.log(`      ${colors.gray}Input:${colors.reset} ${formatInput(result.input)}`);
        console.log(
          `      ${colors.gray}Expected:${colors.reset} valid=${result.expected.valid}${
            result.expected.error ? `, error=${result.expected.error}` : ''
          }${result.expected.field ? `, field=${result.expected.field}` : ''}`
        );
        console.log(
          `      ${colors.gray}Actual:${colors.reset} valid=${result.actual.valid}${
            result.actual.error ? `, error=${result.actual.error}` : ''
          }${result.actual.field ? `, field=${result.actual.field}` : ''}`
        );
      }
    }
  }

  console.log('');
  console.log(
    `${colors.bold}Summary:${colors.reset} ` +
      `${colors.green}${passed} passed${colors.reset}, ` +
      `${colors.red}${failed} failed${colors.reset}, ` +
      `${total} total`
  );
}

/**
 * Load and run all test suites
 */
async function main(): Promise<void> {
  const casesDir = path.join(__dirname, '..', 'cases');

  // Check if directory exists
  if (!fs.existsSync(casesDir)) {
    console.error(`${colors.red}Error: Test cases directory not found: ${casesDir}${colors.reset}`);
    process.exit(1);
  }

  // Find all JSON test files
  const testFiles = fs
    .readdirSync(casesDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(casesDir, f));

  if (testFiles.length === 0) {
    console.error(`${colors.red}Error: No test files found in ${casesDir}${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.cyan}Form Validator - JavaScript Test Runner${colors.reset}`);
  console.log(`${colors.gray}Running ${testFiles.length} test suites...${colors.reset}`);

  let totalPassed = 0;
  let totalFailed = 0;
  let totalTests = 0;

  for (const testFile of testFiles) {
    try {
      const content = fs.readFileSync(testFile, 'utf-8');
      const suite: TestSuite = JSON.parse(content);

      const results = runTestSuite(suite);
      printResults(suite.testSuite, results);

      const passed = results.filter((r) => r.passed).length;
      const failed = results.filter((r) => !r.passed).length;

      totalPassed += passed;
      totalFailed += failed;
      totalTests += results.length;
    } catch (error) {
      console.error(
        `${colors.red}Error loading test file ${path.basename(testFile)}: ${
          error instanceof Error ? error.message : String(error)
        }${colors.reset}`
      );
      totalFailed++;
    }
  }

  console.log('');
  console.log(`${colors.bold}${colors.cyan}=== Overall Results ===${colors.reset}`);
  console.log(
    `${colors.green}${totalPassed} passed${colors.reset}, ` +
      `${colors.red}${totalFailed} failed${colors.reset}, ` +
      `${totalTests} total`
  );

  // Exit with error code if any tests failed
  if (totalFailed > 0) {
    process.exit(1);
  }

  console.log(`${colors.green}All tests passed!${colors.reset}`);
}

// Run main function
main().catch((error) => {
  console.error(`${colors.red}Fatal error: ${error}${colors.reset}`);
  process.exit(1);
});
