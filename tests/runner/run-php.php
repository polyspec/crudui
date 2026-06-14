#!/usr/bin/env php
<?php
/**
 * PHP Test Runner
 *
 * Loads test cases from tests/cases/*.json and validates using packages/validator-php
 * Outputs colored pass/fail results and exits with error code if any fail.
 */

declare(strict_types=1);

// Autoload validator classes
require_once __DIR__ . '/../../packages/validator-php/vendor/autoload.php';

use Polyspec\Validator\Validator;
use Polyspec\Validator\ValidationResult;

// ANSI color codes
class Colors
{
    public const RESET = "\033[0m";
    public const RED = "\033[31m";
    public const GREEN = "\033[32m";
    public const YELLOW = "\033[33m";
    public const BLUE = "\033[34m";
    public const CYAN = "\033[36m";
    public const GRAY = "\033[90m";
    public const BOLD = "\033[1m";
}

/**
 * Convert spec from test format to Validator format
 */
function convertSpec(array $spec): array
{
    if (isset($spec['type']) && $spec['type'] === 'group' && isset($spec['properties'])) {
        return $spec;
    }

    // Wrap simple field spec in a group with a 'value' property
    return [
        'type' => 'group',
        'properties' => [
            'value' => $spec,
        ],
    ];
}

/**
 * Convert input data to match the spec structure
 */
function convertInput(array $spec, mixed $input): array
{
    if (isset($spec['type']) && $spec['type'] === 'group' && isset($spec['properties'])) {
        return is_array($input) ? $input : [];
    }

    // Handle special undefined marker
    if ($input === '__undefined__') {
        return ['value' => null];
    }

    return ['value' => $input];
}

/**
 * Run a single test case
 */
function runTestCase(array $testDef, array $testCase, int $caseIndex): array
{
    $spec = convertSpec($testDef['spec']);
    $input = convertInput($testDef['spec'], $testCase['input']);

    $validator = new Validator($spec);
    $result = $validator->validate($input);

    $actual = [
        'valid' => $result->isValid(),
    ];

    $errors = $result->getErrors();
    if (!$result->isValid() && count($errors) > 0) {
        $firstError = reset($errors);
        $actual['error'] = $firstError['rule'] ?? null;
        $actual['field'] = $firstError['field'] ?? null;
    }

    // Determine if test passed
    $expected = $testCase['expected'];
    $passed = $actual['valid'] === $expected['valid'];

    if (!$expected['valid'] && isset($expected['error'])) {
        $passed = $passed && ($actual['error'] ?? null) === $expected['error'];
    }

    if (!$expected['valid'] && isset($expected['field'])) {
        $passed = $passed && ($actual['field'] ?? null) === $expected['field'];
    }

    return [
        'testId' => $testDef['id'],
        'caseIndex' => $caseIndex,
        'passed' => $passed,
        'expected' => $expected,
        'actual' => $actual,
        'input' => $testCase['input'],
    ];
}

/**
 * Run all tests in a suite
 */
function runTestSuite(array $suite): array
{
    $results = [];

    foreach ($suite['tests'] as $testDef) {
        foreach ($testDef['cases'] as $i => $testCase) {
            $results[] = runTestCase($testDef, $testCase, $i);
        }
    }

    return $results;
}

/**
 * Format input for display
 */
function formatInput(mixed $input): string
{
    if ($input === null) {
        return 'null';
    }
    if ($input === '__undefined__') {
        return 'undefined';
    }
    if (is_string($input)) {
        if ($input === '') {
            return '""';
        }
        if (preg_match('/^\s+$/', $input)) {
            return json_encode($input);
        }
        return '"' . $input . '"';
    }
    if (is_array($input)) {
        return json_encode($input, JSON_UNESCAPED_UNICODE);
    }
    if (is_bool($input)) {
        return $input ? 'true' : 'false';
    }
    return (string)$input;
}

/**
 * Print test results
 */
function printResults(string $suiteName, array $results): void
{
    $passed = count(array_filter($results, fn($r) => $r['passed']));
    $failed = count(array_filter($results, fn($r) => !$r['passed']));
    $total = count($results);

    echo "\n";
    echo Colors::BOLD . Colors::BLUE . "=== {$suiteName} ===" . Colors::RESET . "\n";
    echo "\n";

    // Group results by test ID
    $groupedResults = [];
    foreach ($results as $result) {
        $groupedResults[$result['testId']][] = $result;
    }

    foreach ($groupedResults as $testId => $testResults) {
        $allPassed = count(array_filter($testResults, fn($r) => !$r['passed'])) === 0;
        $icon = $allPassed
            ? Colors::GREEN . "[PASS]" . Colors::RESET
            : Colors::RED . "[FAIL]" . Colors::RESET;

        echo "  {$icon} {$testId}\n";

        // Show failed cases
        foreach ($testResults as $result) {
            if (!$result['passed']) {
                $caseNum = $result['caseIndex'] + 1;
                echo "    " . Colors::GRAY . "Case {$caseNum}:" . Colors::RESET . "\n";
                echo "      " . Colors::GRAY . "Input:" . Colors::RESET . " " . formatInput($result['input']) . "\n";

                $expectedStr = "valid=" . ($result['expected']['valid'] ? 'true' : 'false');
                if (isset($result['expected']['error'])) {
                    $expectedStr .= ", error=" . $result['expected']['error'];
                }
                if (isset($result['expected']['field'])) {
                    $expectedStr .= ", field=" . $result['expected']['field'];
                }
                echo "      " . Colors::GRAY . "Expected:" . Colors::RESET . " {$expectedStr}\n";

                $actualStr = "valid=" . ($result['actual']['valid'] ? 'true' : 'false');
                if (isset($result['actual']['error'])) {
                    $actualStr .= ", error=" . $result['actual']['error'];
                }
                if (isset($result['actual']['field'])) {
                    $actualStr .= ", field=" . $result['actual']['field'];
                }
                echo "      " . Colors::GRAY . "Actual:" . Colors::RESET . " {$actualStr}\n";
            }
        }
    }

    echo "\n";
    echo Colors::BOLD . "Summary:" . Colors::RESET . " ";
    echo Colors::GREEN . "{$passed} passed" . Colors::RESET . ", ";
    echo Colors::RED . "{$failed} failed" . Colors::RESET . ", ";
    echo "{$total} total\n";
}

/**
 * Main function
 */
function main(): int
{
    $casesDir = __DIR__ . '/../cases';

    // Check if directory exists
    if (!is_dir($casesDir)) {
        echo Colors::RED . "Error: Test cases directory not found: {$casesDir}" . Colors::RESET . "\n";
        return 1;
    }

    // Find all JSON test files
    $testFiles = glob($casesDir . '/*.json');

    if (empty($testFiles)) {
        echo Colors::RED . "Error: No test files found in {$casesDir}" . Colors::RESET . "\n";
        return 1;
    }

    echo Colors::CYAN . "Form Validator - PHP Test Runner" . Colors::RESET . "\n";
    echo Colors::GRAY . "Running " . count($testFiles) . " test suites..." . Colors::RESET . "\n";

    $totalPassed = 0;
    $totalFailed = 0;
    $totalTests = 0;

    foreach ($testFiles as $testFile) {
        try {
            $content = file_get_contents($testFile);
            $suite = json_decode($content, true, 512, JSON_THROW_ON_ERROR);

            $results = runTestSuite($suite);
            printResults($suite['testSuite'], $results);

            $passed = count(array_filter($results, fn($r) => $r['passed']));
            $failed = count(array_filter($results, fn($r) => !$r['passed']));

            $totalPassed += $passed;
            $totalFailed += $failed;
            $totalTests += count($results);
        } catch (\Throwable $e) {
            $fileName = basename($testFile);
            echo Colors::RED . "Error loading test file {$fileName}: {$e->getMessage()}" . Colors::RESET . "\n";
            $totalFailed++;
        }
    }

    echo "\n";
    echo Colors::BOLD . Colors::CYAN . "=== Overall Results ===" . Colors::RESET . "\n";
    echo Colors::GREEN . "{$totalPassed} passed" . Colors::RESET . ", ";
    echo Colors::RED . "{$totalFailed} failed" . Colors::RESET . ", ";
    echo "{$totalTests} total\n";

    // Exit with error code if any tests failed
    if ($totalFailed > 0) {
        return 1;
    }

    echo Colors::GREEN . "All tests passed!" . Colors::RESET . "\n";
    return 0;
}

// Run main function
exit(main());
