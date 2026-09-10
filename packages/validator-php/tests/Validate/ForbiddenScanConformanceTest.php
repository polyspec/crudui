<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Tests\Validate;

use CRUDUI\Validator\Compose\ComposeLoadError;
use CRUDUI\Validator;
use PHPUnit\Framework\TestCase;

/**
 * CRUDUI recursive forbidden-scan conformance (SPEC §6 global meta-key rejection).
 *
 * The shared fixture tests/fixtures/spec-validity/cases.json defines the expected
 * result. A clean spec passes; a forbidden meta key found at any depth
 * (slot/bucket body and one level below, deep child subtrees, array elements,
 * $ref-inherited bases) is a LOAD ERROR, never valid:true. PHP loads this ONE
 * file and runs the complete load path (Validate::run = compose →
 * forbidden-scan → validate).
 *
 * Each `ok` case must validate without throwing. Each error case must throw a
 * ComposeLoadError whose code equals the fixture `error_code` AND whose trace
 * (dotted) equals the fixture `at_path`. The test compares both the code and
 * complete path.
 */
final class ForbiddenScanConformanceTest extends TestCase
{
    private const SHARED_FIXTURE = __DIR__ . '/../../../../tests/fixtures/spec-validity/cases.json';

    /** @return array<string, array{0: array<string, mixed>}> */
    public static function fixtureProvider(): array
    {
        $path = \realpath(self::SHARED_FIXTURE);
        self::assertNotFalse($path, 'shared spec-validity fixture not found: ' . self::SHARED_FIXTURE);
        $raw = \file_get_contents($path);
        self::assertNotFalse($raw);
        /** @var list<array<string, mixed>> $cases */
        $cases = \json_decode($raw, true, 512, JSON_THROW_ON_ERROR);

        $objects = json_decode($raw, false, 512, JSON_THROW_ON_ERROR);
        $out = [];
        foreach ($cases as $index => $case) {
            foreach (['spec', 'data', 'files'] as $key) {
                if (property_exists($objects[$index], $key)) $case[$key] = $objects[$index]->{$key};
            }
            $out[$case['name']] = [$case];
        }
        return $out;
    }

    /**
     * @dataProvider fixtureProvider
     * @param array<string, mixed> $case
     */
    public function testForbiddenScanMatchesFixture(array $case): void
    {
        self::assertArrayHasKey('expect', $case, "case {$case['name']} must declare an expect field");

        /** @var array<string, mixed> $spec */
        $spec = $case['spec'];
        /** @var array<string, array<string, mixed>>|null $files */
        $files = $case['files'] ?? null;
        $expect = $case['expect'];

        // Data is irrelevant to the scan; pass an empty map. The scan runs in the
        // load path before any data-driven validation.
        if ($expect === 'ok') {
            // A clean spec must complete the load path without throwing.
            Validator::validate($spec, [], ['files' => $files ?? []]);
            $this->addToAssertionCount(1);
            return;
        }

        /** @var array{error_code: string, at_path: string} $want */
        $want = $expect;
        self::assertIsArray($want, "case {$case['name']} expect must be 'ok' | {error_code, at_path}");
        self::assertArrayHasKey('error_code', $want, "case {$case['name']} expect.error_code missing");
        self::assertArrayHasKey('at_path', $want, "case {$case['name']} expect.at_path missing");

        try {
            Validator::validate($spec, [], ['files' => $files ?? []]);
            self::fail("case {$case['name']} expected load error {$want['error_code']} at {$want['at_path']} but validated successfully");
        } catch (ComposeLoadError $e) {
            self::assertSame(
                $want['error_code'],
                $e->code,
                "error code mismatch for {$case['name']}: {$e->getMessage()}",
            );
            self::assertSame(
                $want['at_path'],
                \implode('.', $e->getCompositionTrace()),
                "error path mismatch for {$case['name']}: {$e->getMessage()}",
            );
        }
    }
}
