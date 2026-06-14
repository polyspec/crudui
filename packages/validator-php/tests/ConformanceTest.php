<?php

declare(strict_types=1);

namespace Polyspec\Validator\Tests;

use Polyspec\Validator\Validator;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Conformance bridge: runs every fixture in tests/cases/*.json (repo root)
 * through the PHP validator via a PHPUnit data provider.
 *
 * The fixtures are the single source of truth - never weaken an assertion
 * here to make a red case green; fix the implementation instead.
 */
final class ConformanceTest extends TestCase
{
    private const CASES_DIR = __DIR__ . '/../../../tests/cases';

    /**
     * @return iterable<string, array{spec: array, input: mixed, expected: array}>
     */
    public static function conformanceCases(): iterable
    {
        $files = glob(self::CASES_DIR . '/*.json');
        if ($files === false || $files === []) {
            throw new \RuntimeException('No fixture files found in ' . self::CASES_DIR);
        }

        foreach ($files as $file) {
            $suite = json_decode((string)file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);
            $suiteName = $suite['testSuite'] ?? basename($file, '.json');

            foreach ($suite['tests'] as $testDef) {
                foreach ($testDef['cases'] as $i => $case) {
                    $caseNum = $i + 1;
                    $key = "{$suiteName} / {$testDef['id']} / case {$caseNum}";

                    yield $key => [
                        'spec' => $testDef['spec'],
                        'input' => $case['input'],
                        'expected' => $case['expected'],
                    ];
                }
            }
        }
    }

    #[DataProvider('conformanceCases')]
    public function testFixtureCase(array $spec, mixed $input, array $expected): void
    {
        $validator = new Validator(self::convertSpec($spec));
        $result = $validator->validate(self::convertInput($spec, $input));

        self::assertSame(
            $expected['valid'],
            $result->isValid(),
            'valid mismatch. errors: ' . json_encode($result->getErrors(), JSON_UNESCAPED_UNICODE)
        );

        if ($expected['valid']) {
            return;
        }

        $errors = $result->getErrors();
        self::assertNotEmpty($errors, 'invalid result must carry at least one error');
        $firstError = reset($errors);

        if (isset($expected['error'])) {
            self::assertSame($expected['error'], $firstError['rule'] ?? null, 'error rule mismatch');
        }

        if (isset($expected['field'])) {
            self::assertSame($expected['field'], $firstError['field'] ?? null, 'error field mismatch');
        }
    }

    /**
     * Wrap simple field specs in a group with a 'value' property
     * (mirrors tests/runner/run-php.php).
     */
    private static function convertSpec(array $spec): array
    {
        if (($spec['type'] ?? null) === 'group' && isset($spec['properties'])) {
            return $spec;
        }

        return [
            'type' => 'group',
            'properties' => [
                'value' => $spec,
            ],
        ];
    }

    /**
     * Convert case input to match the (possibly wrapped) spec structure.
     */
    private static function convertInput(array $spec, mixed $input): array
    {
        if (($spec['type'] ?? null) === 'group' && isset($spec['properties'])) {
            return is_array($input) ? $input : [];
        }

        if ($input === '__undefined__') {
            return ['value' => null];
        }

        return ['value' => $input];
    }
}
