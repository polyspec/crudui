#!/usr/bin/env node
/**
 * Cross-Language Idempotency Comparison Test Runner
 *
 * GOAL: Verify that same spec + same data = same result across JS, PHP, Go.
 *
 * Loads test cases from cases/*.json and runs each test through:
 * - JavaScript validator (direct import)
 * - PHP validator (via `php -r`)
 * - Go validator (via pre-compiled CLI tool)
 *
 * Reports any discrepancies where languages produce different results.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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
  dim: '\x1b[2m',
};

// Paths
const CASES_DIR = path.join(__dirname, '..', 'cases');
const JS_VALIDATOR_DIR = path.join(__dirname, '..', '..', 'validator', 'js');
const PHP_VALIDATOR_DIR = path.join(__dirname, '..', '..', 'validator', 'php');
const GO_VALIDATOR_DIR = path.join(__dirname, '..', '..', 'validator', 'go');

// Statistics
let stats = {
  total: 0,
  matching: 0,
  discrepancies: 0,
  jsErrors: 0,
  phpErrors: 0,
  goErrors: 0,
};

/**
 * Load the JavaScript validator
 */
function loadJsValidator() {
  try {
    // Try compiled version first
    const distPath = path.join(JS_VALIDATOR_DIR, 'dist', 'index.js');
    if (fs.existsSync(distPath)) {
      return require(distPath);
    }
    // Try source directly (requires ts-node or compilation)
    const srcPath = path.join(JS_VALIDATOR_DIR, 'src', 'index.ts');
    if (fs.existsSync(srcPath)) {
      try {
        require('ts-node/register');
        return require(srcPath);
      } catch {
        console.error(`${colors.yellow}Warning: ts-node not available, using dist${colors.reset}`);
      }
    }
    throw new Error('No JS validator found');
  } catch (error) {
    console.error(`${colors.red}Error loading JS validator: ${error.message}${colors.reset}`);
    return null;
  }
}

/**
 * Convert spec from test format to Validator format
 */
function convertSpec(spec) {
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
function convertInput(spec, input) {
  if (spec.type === 'group' && spec.properties) {
    return input;
  }
  if (input === '__undefined__') {
    return { value: undefined };
  }
  return { value: input };
}

/**
 * Normalize validation result for comparison
 */
function normalizeResult(result) {
  return {
    valid: Boolean(result.valid),
    error: result.error || null,
    field: result.field || null,
  };
}

/**
 * Run JavaScript validation
 */
function runJsValidation(jsModule, spec, input) {
  try {
    const convertedSpec = convertSpec(spec);
    const convertedInput = convertInput(spec, input);

    const validator = new jsModule.Validator(convertedSpec);
    const result = validator.validate(convertedInput);

    const validationResult = {
      valid: result.valid,
      error: null,
      field: null,
    };

    if (!result.valid && result.errors && result.errors.length > 0) {
      const firstError = result.errors[0];
      validationResult.error = firstError.rule;
      validationResult.field = firstError.path;
    }

    return { success: true, result: validationResult };
  } catch (error) {
    stats.jsErrors++;
    return { success: false, error: error.message };
  }
}

/**
 * Run PHP validation via subprocess
 */
function runPhpValidation(spec, input) {
  const vendorAutoload = path.join(PHP_VALIDATOR_DIR, 'vendor', 'autoload.php');

  // Check if vendor exists
  if (!fs.existsSync(vendorAutoload)) {
    return {
      success: false,
      error: 'PHP vendor not installed. Run: cd validator/php && composer install',
    };
  }

  // Escape for PHP
  const specJson = JSON.stringify(spec).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const inputJson = JSON.stringify(input).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  const phpScript = `
require_once '${vendorAutoload}';

use FormSpec\\Validator\\Validator;

$spec = json_decode('${specJson}', true);
$input = json_decode('${inputJson}', true);

// Convert spec
if (!isset($spec['type']) || $spec['type'] !== 'group' || !isset($spec['properties'])) {
    $spec = ['type' => 'group', 'properties' => ['value' => $spec]];
    $input = ['value' => $input];
}

// Handle __undefined__ marker
if (is_array($input) && isset($input['value']) && $input['value'] === '__undefined__') {
    $input['value'] = null;
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
      cwd: PHP_VALIDATOR_DIR,
    });

    if (result.error) {
      stats.phpErrors++;
      return { success: false, error: result.error.message };
    }

    if (result.status !== 0) {
      stats.phpErrors++;
      return { success: false, error: result.stderr || 'PHP execution failed' };
    }

    const output = result.stdout.trim();
    if (!output) {
      stats.phpErrors++;
      return { success: false, error: 'Empty PHP output' };
    }

    return { success: true, result: JSON.parse(output) };
  } catch (error) {
    stats.phpErrors++;
    return { success: false, error: error.message };
  }
}

/**
 * Run Go validation via pre-compiled CLI tool
 */
function runGoValidation(spec, input) {
  // Check if Go CLI tool exists
  const goBinaryPath = path.join(GO_VALIDATOR_DIR, 'validate');

  // If binary doesn't exist, try to build it
  if (!fs.existsSync(goBinaryPath)) {
    const buildResult = spawnSync('go', ['build', '-o', 'validate', './cmd/validate'], {
      encoding: 'utf-8',
      timeout: 60000,
      cwd: GO_VALIDATOR_DIR,
      env: { ...process.env, GO111MODULE: 'on' },
    });

    if (buildResult.status !== 0) {
      return {
        success: false,
        error: `Go build failed: ${buildResult.stderr || 'Unknown error'}`,
      };
    }
  }

  // Prepare request
  const request = JSON.stringify({ spec, input });

  try {
    const result = spawnSync(goBinaryPath, [], {
      encoding: 'utf-8',
      input: request,
      timeout: 10000,
      cwd: GO_VALIDATOR_DIR,
    });

    if (result.error) {
      stats.goErrors++;
      return { success: false, error: result.error.message };
    }

    if (result.status !== 0) {
      stats.goErrors++;
      return { success: false, error: result.stderr || 'Go execution failed' };
    }

    const output = result.stdout.trim();
    if (!output) {
      stats.goErrors++;
      return { success: false, error: 'Empty Go output' };
    }

    return { success: true, result: JSON.parse(output) };
  } catch (error) {
    stats.goErrors++;
    return { success: false, error: error.message };
  }
}

/**
 * Compare results from different languages
 */
function resultsMatch(results) {
  const validResults = results.filter((r) => r.success);
  if (validResults.length < 2) return true;

  const first = normalizeResult(validResults[0].result);
  return validResults.every((r) => {
    const normalized = normalizeResult(r.result);
    return (
      normalized.valid === first.valid &&
      normalized.error === first.error
    );
  });
}

/**
 * Format input for display
 */
function formatInput(input) {
  if (input === null) return 'null';
  if (input === undefined) return 'undefined';
  if (input === '__undefined__') return 'undefined';
  if (typeof input === 'string') {
    if (input === '') return '""';
    if (input.length > 50) return `"${input.substring(0, 47)}..."`;
    return `"${input}"`;
  }
  if (typeof input === 'object') {
    const str = JSON.stringify(input);
    if (str.length > 60) return str.substring(0, 57) + '...';
    return str;
  }
  return String(input);
}

/**
 * Format result for display
 */
function formatResult(langResult) {
  if (!langResult.success) {
    return `${colors.red}ERROR: ${langResult.error}${colors.reset}`;
  }
  const r = langResult.result;
  let str = r.valid ? `${colors.green}valid=true${colors.reset}` : `${colors.red}valid=false${colors.reset}`;
  if (r.error) str += `, error=${r.error}`;
  if (r.field) str += `, field=${r.field}`;
  return str;
}

/**
 * Run comparison for all test cases
 */
function runComparison(jsModule, testFile, enabledLangs) {
  const content = fs.readFileSync(testFile, 'utf-8');
  const suite = JSON.parse(content);
  const discrepancies = [];

  console.log(`\n${colors.bold}${colors.blue}=== ${suite.testSuite} ===${colors.reset}`);
  console.log(`${colors.gray}${suite.description}${colors.reset}\n`);

  for (const testDef of suite.tests) {
    for (let caseIndex = 0; caseIndex < testDef.cases.length; caseIndex++) {
      const testCase = testDef.cases[caseIndex];
      stats.total++;

      const results = {};

      // Run JS
      if (enabledLangs.includes('js')) {
        results.js = runJsValidation(jsModule, testDef.spec, testCase.input);
      }

      // Run PHP
      if (enabledLangs.includes('php')) {
        results.php = runPhpValidation(testDef.spec, testCase.input);
      }

      // Run Go
      if (enabledLangs.includes('go')) {
        results.go = runGoValidation(testDef.spec, testCase.input);
      }

      // Check for discrepancies
      const resultArray = Object.values(results);
      const allMatch = resultsMatch(resultArray);

      if (allMatch) {
        stats.matching++;
      } else {
        stats.discrepancies++;
        discrepancies.push({
          testId: testDef.id,
          caseIndex,
          description: testDef.description,
          input: testCase.input,
          expected: testCase.expected,
          results,
        });
      }
    }
  }

  // Print discrepancies for this suite
  if (discrepancies.length > 0) {
    console.log(`${colors.yellow}Discrepancies Found:${colors.reset}\n`);
    for (const disc of discrepancies) {
      console.log(
        `  ${colors.yellow}[DIFF]${colors.reset} ${disc.testId} Case ${disc.caseIndex + 1}`
      );
      console.log(`  ${colors.gray}Description:${colors.reset} ${disc.description}`);
      console.log(`  ${colors.gray}Input:${colors.reset} ${formatInput(disc.input)}`);
      console.log(
        `  ${colors.gray}Expected:${colors.reset} valid=${disc.expected.valid}${
          disc.expected.error ? `, error=${disc.expected.error}` : ''
        }${disc.expected.field ? `, field=${disc.expected.field}` : ''}`
      );
      console.log(`  ${colors.gray}Results:${colors.reset}`);
      for (const [lang, result] of Object.entries(disc.results)) {
        console.log(`    ${colors.cyan}${lang.toUpperCase()}:${colors.reset} ${formatResult(result)}`);
      }
      console.log('');
    }
  } else {
    console.log(`  ${colors.green}All tests match across languages${colors.reset}\n`);
  }

  return discrepancies.length;
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let enabledLangs = ['js', 'php', 'go'];
  let verbose = false;
  let specificFile = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--js-only') {
      enabledLangs = ['js'];
    } else if (arg === '--php-only') {
      enabledLangs = ['php'];
    } else if (arg === '--go-only') {
      enabledLangs = ['go'];
    } else if (arg === '--no-go') {
      enabledLangs = enabledLangs.filter((l) => l !== 'go');
    } else if (arg === '--no-php') {
      enabledLangs = enabledLangs.filter((l) => l !== 'php');
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (arg === '--file' || arg === '-f') {
      specificFile = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
${colors.cyan}Cross-Language Idempotency Test Runner${colors.reset}

GOAL: Verify that same spec + same data = same result across JS, PHP, Go.

Usage: node compare-all.js [options]

Options:
  --js-only       Run JavaScript validator only
  --php-only      Run PHP validator only
  --go-only       Run Go validator only
  --no-go         Skip Go validator
  --no-php        Skip PHP validator
  --file, -f      Test specific file only
  --verbose, -v   Show all results, not just discrepancies
  --help, -h      Show this help message

Examples:
  node compare-all.js                    # Compare all three languages
  node compare-all.js --no-go            # Compare JS and PHP only
  node compare-all.js -f required.json   # Test specific file
`);
      process.exit(0);
    }
  }

  console.log(`${colors.bold}${colors.cyan}Cross-Language Idempotency Test Runner${colors.reset}`);
  console.log(`${colors.gray}Languages: ${enabledLangs.join(', ')}${colors.reset}`);
  console.log(`${colors.gray}Goal: Verify same spec + same data = same result${colors.reset}`);

  // Load JavaScript validator
  const jsModule = loadJsValidator();
  if (!jsModule && enabledLangs.includes('js')) {
    console.error(`${colors.red}Failed to load JavaScript validator${colors.reset}`);
    process.exit(1);
  }

  // Find test files
  let testFiles;
  if (specificFile) {
    const fullPath = path.join(CASES_DIR, specificFile);
    if (!fs.existsSync(fullPath)) {
      console.error(`${colors.red}Test file not found: ${specificFile}${colors.reset}`);
      process.exit(1);
    }
    testFiles = [fullPath];
  } else {
    testFiles = fs
      .readdirSync(CASES_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => path.join(CASES_DIR, f));
  }

  console.log(`${colors.gray}Running ${testFiles.length} test suite(s)...${colors.reset}`);

  // Run comparisons
  let totalDiscrepancies = 0;
  for (const testFile of testFiles) {
    try {
      totalDiscrepancies += runComparison(jsModule, testFile, enabledLangs);
    } catch (error) {
      console.error(
        `${colors.red}Error processing ${path.basename(testFile)}: ${error.message}${colors.reset}`
      );
    }
  }

  // Print summary
  console.log(`\n${colors.bold}${colors.cyan}=== Idempotency Summary ===${colors.reset}`);
  console.log(`${colors.gray}Total test cases: ${stats.total}${colors.reset}`);
  console.log(
    `${colors.green}Matching results: ${stats.matching}${colors.reset} (${
      ((stats.matching / stats.total) * 100).toFixed(1)
    }%)`
  );

  if (stats.discrepancies > 0) {
    console.log(
      `${colors.red}Discrepancies: ${stats.discrepancies}${colors.reset} (${
        ((stats.discrepancies / stats.total) * 100).toFixed(1)
      }%)`
    );
  }

  if (stats.jsErrors > 0) {
    console.log(`${colors.yellow}JS Errors: ${stats.jsErrors}${colors.reset}`);
  }
  if (stats.phpErrors > 0) {
    console.log(`${colors.yellow}PHP Errors: ${stats.phpErrors}${colors.reset}`);
  }
  if (stats.goErrors > 0) {
    console.log(`${colors.yellow}Go Errors: ${stats.goErrors}${colors.reset}`);
  }

  console.log('');

  if (totalDiscrepancies > 0) {
    console.log(
      `${colors.bold}${colors.red}IDEMPOTENCY VIOLATION: Languages produce different results!${colors.reset}`
    );
    console.log(
      `${colors.gray}Same input should produce same output across all languages.${colors.reset}`
    );
    process.exit(1);
  }

  console.log(
    `${colors.bold}${colors.green}IDEMPOTENCY VERIFIED: All languages produce identical results!${colors.reset}`
  );
}

// Run main function
main();
