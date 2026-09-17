<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Tests;

use CRUDUI\Validator\Legacy\Validator;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../../tests/conformance/evidence.php';

/**
 * Conformance bridge: runs every entry of tests/fixtures/legacy-validate/cases.json
 * (repo root) through the PHP legacy validator via a PHPUnit data provider.
 *
 * The fixture defines the expected validation results. One test runs every case
 * of an entry and records one validateLegacy evidence line for the entry, passed
 * only when all of its cases pass.
 */
final class ConformanceTest extends TestCase
{
    private const FIXTURE = 'tests/fixtures/legacy-validate/cases.json';
    private const ROOT = __DIR__ . '/../../..';

    /**
     * @return iterable<string, array{entry: array<string, mixed>}>
     */
    public static function conformanceEntries(): iterable
    {
        $path = self::ROOT . '/' . self::FIXTURE;
        $raw = file_get_contents($path);
        if ($raw === false) {
            throw new \RuntimeException('Cannot read fixture ' . $path);
        }
        $entries = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($entries) || $entries === []) {
            throw new \RuntimeException('No fixture entries found in ' . $path);
        }

        foreach ($entries as $entry) {
            yield "{$entry['suite']} / {$entry['name']}" => ['entry' => $entry];
        }
    }

    /** @param array<string, mixed> $entry */
    #[DataProvider('conformanceEntries')]
    public function testFixtureEntry(array $entry): void
    {
        $passed = false;
        try {
            foreach ($entry['cases'] as $i => $case) {
                $this->assertFixtureCase($entry['spec'], $case['input'], $case['expected'], "{$entry['name']} case " . ($i + 1));
            }
            $passed = true;
        } finally {
            crudui_record_conformance('validateLegacy', self::FIXTURE, 'php', $entry['name'], $passed);
        }
    }

    private function assertFixtureCase(array $spec, mixed $input, array $expected, string $label): void
    {
        $validator = new Validator(self::convertSpec($spec));
        $result = $validator->validate(self::convertInput($spec, $input));

        self::assertSame(
            $expected['valid'],
            $result->isValid(),
            "{$label}: valid mismatch. errors: " . json_encode($result->getErrors(), JSON_UNESCAPED_UNICODE)
        );

        if ($expected['valid']) {
            return;
        }

        $errors = $result->getErrors();
        self::assertNotEmpty($errors, "{$label}: invalid result must carry at least one error");
        $firstError = reset($errors);

        if (isset($expected['error'])) {
            self::assertSame($expected['error'], $firstError['rule'] ?? null, "{$label}: error rule mismatch");
        }

        if (isset($expected['field'])) {
            self::assertSame($expected['field'], $firstError['field'] ?? null, "{$label}: error field mismatch");
        }
    }

    /**
     * Wrap simple field specs in a group with a 'value' property, as the other
     * runtimes' legacy conformance tests do.
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
