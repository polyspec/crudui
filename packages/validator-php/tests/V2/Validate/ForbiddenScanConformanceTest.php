<?php

declare(strict_types=1);

namespace Polyspec\Validator\Tests\V2\Validate;

use Polyspec\Validator\V2\Compose\ComposeLoadError;
use Polyspec\Validator\V2\Validate\Validate;
use PHPUnit\Framework\TestCase;

/**
 * v2 recursive forbidden-scan conformance (SPEC-V2 §6 global meta-key rejection).
 *
 * The shared 4-language fixture tests/fixtures/spec-validity/cases.json is the
 * single truth: a clean spec passes; a forbidden meta key found at ANY depth
 * (slot/bucket body and one level below, deep child subtrees, array elements,
 * $ref-inherited bases) is a LOAD ERROR, never valid:true. PHP loads this ONE
 * file and runs the real load path (Validate::run = compose → forbidden-scan →
 * validate), reproducing the JS / Go / Rust verdict bit-for-bit.
 *
 * Each `ok` case must validate without throwing. Each error case must throw a
 * ComposeLoadError whose code equals the fixture `error_code` AND whose trace
 * (dotted) equals the fixture `at_path` — the depth is load-bearing, so the path
 * is asserted, not just the code. Never weaken an assertion to turn red green;
 * fix the engine, the fixture, or both at their shared source — not this test.
 */
final class ForbiddenScanConformanceTest extends TestCase
{
    private const SHARED_FIXTURE = __DIR__ . '/../../../../../tests/fixtures/spec-validity/cases.json';

    /** @return array<string, array{0: array<string, mixed>}> */
    public static function fixtureProvider(): array
    {
        $path = \realpath(self::SHARED_FIXTURE);
        self::assertNotFalse($path, 'shared spec-validity fixture not found: ' . self::SHARED_FIXTURE);
        $raw = \file_get_contents($path);
        self::assertNotFalse($raw);
        /** @var list<array<string, mixed>> $cases */
        $cases = \json_decode($raw, true, 512, JSON_THROW_ON_ERROR);

        $out = [];
        foreach ($cases as $case) {
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
            Validate::run($spec, [], $files);
            $this->addToAssertionCount(1);
            return;
        }

        /** @var array{error_code: string, at_path: string} $want */
        $want = $expect;
        self::assertIsArray($want, "case {$case['name']} expect must be 'ok' | {error_code, at_path}");
        self::assertArrayHasKey('error_code', $want, "case {$case['name']} expect.error_code missing");
        self::assertArrayHasKey('at_path', $want, "case {$case['name']} expect.at_path missing");

        try {
            Validate::run($spec, [], $files);
            self::fail("case {$case['name']} expected load error {$want['error_code']} at {$want['at_path']} but validated successfully");
        } catch (ComposeLoadError $e) {
            self::assertSame(
                $want['error_code'],
                $e->code,
                "error code mismatch for {$case['name']}: {$e->getMessage()}",
            );
            self::assertSame(
                $want['at_path'],
                \implode('.', $e->trace),
                "error path mismatch for {$case['name']}: {$e->getMessage()}",
            );
        }
    }
}
