<?php
/**
 * ProductNft Test Runner for PHP Validator
 *
 * This script tests the PHP validator against the ProductNft spec test cases.
 */

require_once __DIR__ . '/../validator/php/vendor/autoload.php';

use FormSpec\Validator\Legacy\Validator;

// Load test cases
$testCasesPath = __DIR__ . '/cases/productnft.json';
$testData = json_decode(file_get_contents($testCasesPath), true);

echo "\n" . str_repeat('=', 70) . "\n";
echo "Running ProductNft Tests - PHP Validator\n";
echo str_repeat('=', 70) . "\n\n";

$totalTests = 0;
$passedTests = 0;
$failedTests = 0;
$failures = [];

foreach ($testData['tests'] as $test) {
    echo "\nTest: {$test['id']} - {$test['description']}\n";
    echo str_repeat('-', 60) . "\n";

    foreach ($test['cases'] as $i => $testCase) {
        $caseNum = $i + 1;
        $totalTests++;

        try {
            // Convert spec format to Validator format
            $spec = convertSpec($test['spec']);
            $validator = new Validator($spec);
            $result = $validator->validate($testCase['input']);

            // Check result
            $expectedValid = $testCase['expected']['valid'];
            $actualValid = $result->isValid();

            $passed = $expectedValid === $actualValid;

            // Check error type if expected to be invalid
            if (!$expectedValid && isset($testCase['expected']['error']) && !$actualValid) {
                $errors = $result->getErrors();
                if (!empty($errors)) {
                    $firstError = reset($errors);
                    $expectedError = $testCase['expected']['error'];
                    $actualError = $firstError['rule'];
                    if ($actualError !== $expectedError) {
                        $passed = false;
                    }
                }
            }

            // Check field path if specified
            if (!$expectedValid && isset($testCase['expected']['field']) && !$actualValid) {
                $errors = $result->getErrors();
                if (!empty($errors)) {
                    $firstError = reset($errors);
                    $expectedField = $testCase['expected']['field'];
                    $actualField = $firstError['field'];
                    if ($actualField !== $expectedField) {
                        $passed = false;
                    }
                }
            }

            if ($passed) {
                $passedTests++;
                echo "  Case {$caseNum}: PASS\n";
            } else {
                $failedTests++;
                $failure = [
                    'testId' => $test['id'],
                    'caseIndex' => $caseNum,
                    'input' => $testCase['input'],
                    'expected' => $testCase['expected'],
                    'actual' => ['valid' => $actualValid, 'errors' => $result->getErrors()]
                ];
                $failures[] = $failure;

                $errors = $result->getErrors();
                $errorInfo = !empty($errors) ? ', error=' . reset($errors)['rule'] . ', field=' . reset($errors)['field'] : '';

                echo "  Case {$caseNum}: FAIL\n";
                echo "    Expected: valid=" . ($expectedValid ? 'true' : 'false');
                if (isset($testCase['expected']['error'])) echo ", error={$testCase['expected']['error']}";
                if (isset($testCase['expected']['field'])) echo ", field={$testCase['expected']['field']}";
                echo "\n";
                echo "    Actual: valid=" . ($actualValid ? 'true' : 'false') . $errorInfo . "\n";
            }
        } catch (Exception $e) {
            $failedTests++;
            $failures[] = [
                'testId' => $test['id'],
                'caseIndex' => $caseNum,
                'error' => $e->getMessage()
            ];
            echo "  Case {$caseNum}: ERROR - {$e->getMessage()}\n";
        }
    }
}

echo "\n" . str_repeat('=', 70) . "\n";
echo "RESULTS: {$passedTests}/{$totalTests} passed, {$failedTests} failed\n";
echo str_repeat('=', 70) . "\n\n";

if (!empty($failures)) {
    echo "Failed Tests:\n";
    foreach ($failures as $f) {
        $errorStr = isset($f['error']) ? ': ' . $f['error'] : '';
        echo "  - {$f['testId']} Case {$f['caseIndex']}{$errorStr}\n";
    }
}

function convertSpec(array $spec): array {
    return [
        'type' => $spec['type'] ?? 'group',
        'properties' => convertProperties($spec['properties'] ?? [])
    ];
}

function convertProperties(array $props): array {
    $result = [];
    foreach ($props as $key => $value) {
        $result[$key] = $value;
        if (isset($value['properties'])) {
            $result[$key]['properties'] = convertProperties($value['properties']);
        }
    }
    return $result;
}
