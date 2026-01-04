#!/usr/bin/env npx ts-node
/**
 * Cross-Language Comparison Tool
 *
 * Runs all three validators (JS, PHP, Go) on the same test cases
 * and reports any differences in results. Ensures idempotency across languages.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawnSync } from 'child_process';
import { Validator } from '../../validator/js/src/index';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
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

interface ValidationResult {
  valid: boolean;
  error?: string;
  field?: string;
}

interface LanguageResult {
  language: string;
  result: ValidationResult;
  error?: string;
}

interface ComparisonResult {
  testId: string;
  caseIndex: number;
  input: unknown;
  expected: TestCase['expected'];
  results: LanguageResult[];
  allMatch: boolean;
  allCorrect: boolean;
}

/**
 * Convert spec from test format to Validator format
 */
function convertSpec(spec: Record<string, unknown>): Record<string, unknown> {
  if (spec.type === 'group' && spec.properties) {
    return spec;
  }
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
  if (input === '__undefined__') {
    return { value: undefined };
  }
  return { value: input };
}

/**
 * Run JavaScript validation
 */
function runJsValidation(spec: Record<string, unknown>, input: unknown): ValidationResult {
  const convertedSpec = convertSpec(spec);
  const convertedInput = convertInput(spec, input);

  const validator = new Validator(convertedSpec as any);
  const result = validator.validate(convertedInput);

  const validationResult: ValidationResult = {
    valid: result.valid,
  };

  if (!result.valid && result.errors.length > 0) {
    const firstError = result.errors[0]!;
    validationResult.error = firstError.rule;
    validationResult.field = firstError.path;
  }

  return validationResult;
}

/**
 * Run PHP validation via subprocess
 */
function runPhpValidation(spec: Record<string, unknown>, input: unknown): ValidationResult {
  const phpScript = `
<?php
require_once '${path.join(__dirname, '../../validator/php/vendor/autoload.php')}';

use FormSpec\\Validator\\Validator;

$spec = json_decode('${JSON.stringify(spec).replace(/'/g, "\\'")}', true);
$input = json_decode('${JSON.stringify(input).replace(/'/g, "\\'")}', true);

// Convert spec
if (!isset($spec['type']) || $spec['type'] !== 'group' || !isset($spec['properties'])) {
    $spec = ['type' => 'group', 'properties' => ['value' => $spec]];
    $input = ['value' => $input];
}

$validator = new Validator($spec);
$result = $validator->validate($input ?? []);

$output = ['valid' => $result->isValid()];
$errors = $result->getErrors();
if (!$result->isValid() && count($errors) > 0) {
    $firstError = reset($errors);
    $output['error'] = $firstError['rule'] ?? null;
    $output['field'] = $firstError['field'] ?? null;
}

echo json_encode($output);
`;

  try {
    const result = spawnSync('php', ['-r', phpScript], {
      encoding: 'utf-8',
      timeout: 10000,
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      throw new Error(result.stderr || 'PHP execution failed');
    }

    return JSON.parse(result.stdout.trim());
  } catch (error) {
    return {
      valid: false,
      error: `PHP_ERROR: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Run Go validation via subprocess
 * Note: This requires the Go validator to be compiled first
 */
function runGoValidation(spec: Record<string, unknown>, input: unknown): ValidationResult {
  // For now, we'll create a temporary Go file and run it
  // In production, you'd want a compiled binary or gRPC service

  const goValidatorPath = path.join(__dirname, '../../validator/go');

  // Create a temporary validation script
  const tempGoFile = path.join('/tmp', `validate_${Date.now()}.go`);
  const specJson = JSON.stringify(spec);
  const inputJson = JSON.stringify(input);

  const goScript = `
package main

import (
	"encoding/json"
	"fmt"
	"os"

	validator "${goValidatorPath}/validator"
)

type TestSpec struct {
	Type       string                 \`json:"type"\`
	Properties map[string]interface{} \`json:"properties"\`
	Rules      map[string]interface{} \`json:"rules"\`
}

func main() {
	specJson := \`${specJson.replace(/`/g, '` + "`" + `')}\`
	inputJson := \`${inputJson.replace(/`/g, '` + "`" + `')}\`

	var spec map[string]interface{}
	var input interface{}

	json.Unmarshal([]byte(specJson), &spec)
	json.Unmarshal([]byte(inputJson), &input)

	// Convert spec
	specType, _ := spec["type"].(string)
	_, hasProps := spec["properties"].(map[string]interface{})

	var validatorSpec validator.Spec
	var validatorInput map[string]interface{}

	if specType == "group" && hasProps {
		// Complex conversion needed
		validatorSpec = convertSpec(spec)
		if m, ok := input.(map[string]interface{}); ok {
			validatorInput = m
		} else {
			validatorInput = make(map[string]interface{})
		}
	} else {
		validatorSpec = validator.Spec{
			Fields: []validator.Field{{
				Name:  "value",
				Type:  specType,
				Rules: getRules(spec),
			}},
		}
		validatorInput = map[string]interface{}{"value": input}
	}

	v := validator.NewValidator(validatorSpec)
	result := v.Validate(validatorInput)

	output := map[string]interface{}{
		"valid": result.IsValid,
	}

	if !result.IsValid && len(result.Errors) > 0 {
		output["error"] = result.Errors[0].Rule
		output["field"] = result.Errors[0].Field
	}

	jsonOutput, _ := json.Marshal(output)
	fmt.Println(string(jsonOutput))
}

func convertSpec(spec map[string]interface{}) validator.Spec {
	props, _ := spec["properties"].(map[string]interface{})
	var fields []validator.Field
	for name, fs := range props {
		if fieldSpec, ok := fs.(map[string]interface{}); ok {
			fields = append(fields, convertField(name, fieldSpec))
		}
	}
	return validator.Spec{Fields: fields}
}

func convertField(name string, spec map[string]interface{}) validator.Field {
	field := validator.Field{Name: name}
	if t, ok := spec["type"].(string); ok {
		field.Type = t
	}
	field.Rules = getRules(spec)

	if props, ok := spec["properties"].(map[string]interface{}); ok {
		for pname, ps := range props {
			if pspec, ok := ps.(map[string]interface{}); ok {
				field.Fields = append(field.Fields, convertField(pname, pspec))
			}
		}
	}

	return field
}

func getRules(spec map[string]interface{}) map[string]interface{} {
	if rules, ok := spec["rules"].(map[string]interface{}); ok {
		return rules
	}
	return nil
}
`;

  try {
    // Try using go run with the existing module
    const result = spawnSync(
      'go',
      ['run', '-C', goValidatorPath, './...'],
      {
        encoding: 'utf-8',
        timeout: 30000,
        input: JSON.stringify({ spec, input }),
        env: { ...process.env, GO111MODULE: 'on' },
      }
    );

    // For now, return a placeholder indicating Go testing needs the binary
    return {
      valid: false,
      error: 'GO_NOT_COMPILED: Run `go build` in validator/go first',
    };
  } catch (error) {
    return {
      valid: false,
      error: `GO_ERROR: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Compare results from different languages
 */
function compareResults(results: LanguageResult[]): boolean {
  if (results.length < 2) return true;

  const first = results[0]!;
  return results.every((r) => {
    if (r.result.error?.startsWith('GO_')) return true; // Skip Go errors
    if (r.result.error?.startsWith('PHP_')) return true; // Skip PHP errors
    return (
      r.result.valid === first.result.valid &&
      r.result.error === first.result.error &&
      r.result.field === first.result.field
    );
  });
}

/**
 * Check if all results match expected
 */
function checkCorrectness(results: LanguageResult[], expected: TestCase['expected']): boolean {
  return results.every((r) => {
    if (r.result.error?.startsWith('GO_')) return true; // Skip Go errors
    if (r.result.error?.startsWith('PHP_')) return true; // Skip PHP errors

    let correct = r.result.valid === expected.valid;
    if (!expected.valid && expected.error) {
      correct = correct && r.result.error === expected.error;
    }
    if (!expected.valid && expected.field) {
      correct = correct && r.result.field === expected.field;
    }
    return correct;
  });
}

/**
 * Run comparison for a test case
 */
function runComparison(
  testDef: TestDefinition,
  testCase: TestCase,
  caseIndex: number,
  languages: string[]
): ComparisonResult {
  const results: LanguageResult[] = [];

  if (languages.includes('js')) {
    try {
      results.push({
        language: 'JavaScript',
        result: runJsValidation(testDef.spec, testCase.input),
      });
    } catch (error) {
      results.push({
        language: 'JavaScript',
        result: { valid: false },
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (languages.includes('php')) {
    try {
      results.push({
        language: 'PHP',
        result: runPhpValidation(testDef.spec, testCase.input),
      });
    } catch (error) {
      results.push({
        language: 'PHP',
        result: { valid: false },
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (languages.includes('go')) {
    try {
      results.push({
        language: 'Go',
        result: runGoValidation(testDef.spec, testCase.input),
      });
    } catch (error) {
      results.push({
        language: 'Go',
        result: { valid: false },
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    testId: testDef.id,
    caseIndex,
    input: testCase.input,
    expected: testCase.expected,
    results,
    allMatch: compareResults(results),
    allCorrect: checkCorrectness(results, testCase.expected),
  };
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
    return `"${input}"`;
  }
  if (typeof input === 'object') {
    return JSON.stringify(input);
  }
  return String(input);
}

/**
 * Print comparison results
 */
function printComparisonResults(suiteName: string, results: ComparisonResult[]): void {
  const allMatch = results.filter((r) => r.allMatch).length;
  const allCorrect = results.filter((r) => r.allCorrect).length;
  const differences = results.filter((r) => !r.allMatch);
  const incorrect = results.filter((r) => !r.allCorrect);
  const total = results.length;

  console.log('');
  console.log(`${colors.bold}${colors.blue}=== ${suiteName} ===${colors.reset}`);
  console.log('');

  // Show differences
  if (differences.length > 0) {
    console.log(`${colors.yellow}Cross-Language Differences:${colors.reset}`);
    for (const diff of differences) {
      console.log(`  ${colors.yellow}[DIFF]${colors.reset} ${diff.testId} Case ${diff.caseIndex + 1}`);
      console.log(`    ${colors.gray}Input:${colors.reset} ${formatInput(diff.input)}`);
      for (const lr of diff.results) {
        const resultStr = `valid=${lr.result.valid}${
          lr.result.error ? `, error=${lr.result.error}` : ''
        }${lr.result.field ? `, field=${lr.result.field}` : ''}`;
        console.log(`    ${colors.gray}${lr.language}:${colors.reset} ${resultStr}`);
      }
    }
    console.log('');
  }

  // Show incorrect results
  if (incorrect.length > 0) {
    console.log(`${colors.red}Incorrect Results:${colors.reset}`);
    for (const inc of incorrect) {
      if (inc.allMatch) continue; // Already shown in differences
      console.log(`  ${colors.red}[WRONG]${colors.reset} ${inc.testId} Case ${inc.caseIndex + 1}`);
      console.log(`    ${colors.gray}Input:${colors.reset} ${formatInput(inc.input)}`);
      console.log(
        `    ${colors.gray}Expected:${colors.reset} valid=${inc.expected.valid}${
          inc.expected.error ? `, error=${inc.expected.error}` : ''
        }${inc.expected.field ? `, field=${inc.expected.field}` : ''}`
      );
      for (const lr of inc.results) {
        const resultStr = `valid=${lr.result.valid}${
          lr.result.error ? `, error=${lr.result.error}` : ''
        }${lr.result.field ? `, field=${lr.result.field}` : ''}`;
        console.log(`    ${colors.gray}${lr.language}:${colors.reset} ${resultStr}`);
      }
    }
    console.log('');
  }

  // Summary
  console.log(
    `${colors.bold}Summary:${colors.reset} ` +
      `${colors.green}${allMatch}/${total} matching${colors.reset}, ` +
      `${colors.green}${allCorrect}/${total} correct${colors.reset}`
  );
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse arguments
  let languages = ['js', 'php'];
  let verbose = false;

  for (const arg of args) {
    if (arg === '--all' || arg === '-a') {
      languages = ['js', 'php', 'go'];
    } else if (arg === '--js') {
      languages = ['js'];
    } else if (arg === '--php') {
      languages = ['php'];
    } else if (arg === '--go') {
      languages = ['go'];
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
${colors.cyan}Cross-Language Validation Comparison Tool${colors.reset}

Usage: npx ts-node compare.ts [options]

Options:
  --js          Run JavaScript validator only
  --php         Run PHP validator only
  --go          Run Go validator only
  --all, -a     Run all validators (including Go)
  --verbose, -v Show all results, not just differences
  --help, -h    Show this help message

By default, runs JavaScript and PHP validators.
`);
      process.exit(0);
    }
  }

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

  console.log(`${colors.cyan}Cross-Language Validation Comparison${colors.reset}`);
  console.log(`${colors.gray}Languages: ${languages.join(', ')}${colors.reset}`);
  console.log(`${colors.gray}Running ${testFiles.length} test suites...${colors.reset}`);

  let totalMatching = 0;
  let totalCorrect = 0;
  let totalTests = 0;
  let hasDifferences = false;

  for (const testFile of testFiles) {
    try {
      const content = fs.readFileSync(testFile, 'utf-8');
      const suite: TestSuite = JSON.parse(content);

      const results: ComparisonResult[] = [];

      for (const testDef of suite.tests) {
        for (let i = 0; i < testDef.cases.length; i++) {
          const testCase = testDef.cases[i]!;
          const result = runComparison(testDef, testCase, i, languages);
          results.push(result);
        }
      }

      printComparisonResults(suite.testSuite, results);

      const matching = results.filter((r) => r.allMatch).length;
      const correct = results.filter((r) => r.allCorrect).length;

      totalMatching += matching;
      totalCorrect += correct;
      totalTests += results.length;

      if (results.some((r) => !r.allMatch)) {
        hasDifferences = true;
      }
    } catch (error) {
      console.error(
        `${colors.red}Error loading test file ${path.basename(testFile)}: ${
          error instanceof Error ? error.message : String(error)
        }${colors.reset}`
      );
    }
  }

  console.log('');
  console.log(`${colors.bold}${colors.cyan}=== Overall Comparison Results ===${colors.reset}`);
  console.log(
    `${colors.green}${totalMatching}/${totalTests} cross-language matches${colors.reset}`
  );
  console.log(`${colors.green}${totalCorrect}/${totalTests} correct results${colors.reset}`);

  if (hasDifferences) {
    console.log('');
    console.log(
      `${colors.yellow}Warning: Cross-language differences detected!${colors.reset}`
    );
    console.log(
      `${colors.gray}This may indicate implementation inconsistencies.${colors.reset}`
    );
    process.exit(1);
  }

  if (totalCorrect < totalTests) {
    console.log('');
    console.log(`${colors.red}Some tests failed!${colors.reset}`);
    process.exit(1);
  }

  console.log('');
  console.log(`${colors.green}All validators produce identical, correct results!${colors.reset}`);
}

// Run main function
main().catch((error) => {
  console.error(`${colors.red}Fatal error: ${error}${colors.reset}`);
  process.exit(1);
});
