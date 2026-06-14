<?php

declare(strict_types=1);

namespace FormSpec\Validator\Tests\V2\Validate;

use FormSpec\Validator\V2\Compose\ComposeLoadError;
use FormSpec\Validator\V2\Validate\ListValidate;
use PHPUnit\Framework\TestCase;

/**
 * v2 list-spec validation conformance (SPEC-V2 §9) — the read sister of
 * ValidateConformanceTest, isomorphic with the JS reference
 * validator-js/src/v2/validate-list/validate-list.conformance.test.ts.
 *
 * It pins the four-language STRUCTURE gate for a list-spec: compose ($ref/$patch
 * on the columns map and a { $ref, $patch } search overlay) + forbidden-scan over
 * the whole composed list tree. It does NOT validate rows — a list has no data
 * (rows are injected, SPEC §9).
 *
 * It runs the SHARED fixture tests/fixtures/v2-list-validity/cases.json — the SAME
 * file the JS engine and the ajv meta-schema gate read. The two gates own
 * different halves and the fixture's `engine` field says which:
 *  - engine: "pass"          — the four-language engine has NO opinion (a "schema
 *    shape" check: required/enum/additionalProperties/anyOf). The meta-schema may
 *    still REJECT it; the engine must NOT throw and returns { valid:true,
 *    errors:[] }.
 *  - engine: { code, at }    — the engine REJECTS it as a LOAD failure (a
 *    forbidden meta key surfaced by compose+forbidden-scan). The thrown
 *    ComposeLoadError code and dotted trace are asserted — the depth is
 *    load-bearing.
 *
 * PHP must reach the SAME verdict the JS engine reaches, bit-for-bit (G-B
 * idempotence). Never weaken an assertion to turn red green; fix the engine, the
 * fixture, or both at their shared source — not this test.
 */
final class ListValidateConformanceTest extends TestCase
{
    private const SHARED_FIXTURE = __DIR__ . '/../../../../../tests/fixtures/v2-list-validity/cases.json';

    /** @return array<string, array{0: array<string, mixed>}> */
    public static function fixtureProvider(): array
    {
        $path = \realpath(self::SHARED_FIXTURE);
        self::assertNotFalse($path, 'shared v2-list-validity fixture not found: ' . self::SHARED_FIXTURE);
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
    public function testListEngineMatchesFixture(array $case): void
    {
        self::assertArrayHasKey('engine', $case, "case {$case['name']} must declare an engine expectation");

        /** @var array<string, mixed> $spec */
        $spec = $case['spec'];
        /** @var array<string, array<string, mixed>>|null $files */
        $files = $case['files'] ?? null;
        $engine = $case['engine'];

        if ($engine === 'pass') {
            // The structure gate must NOT throw. A meta-schema-only RED case
            // (required/enum/additionalProperties/anyOf) is the meta-schema's job,
            // never this engine's — so it loads clean here. No rows → no data
            // validation: a clean load is always { valid:true, errors:[] }.
            $result = ListValidate::run($spec, $files);
            self::assertTrue($result->valid, "case {$case['name']} must not be rejected by the structure gate");
            self::assertSame([], $result->errors, "case {$case['name']} must produce no errors on a clean load");
            return;
        }

        // engine: { code, at } — the engine REJECTS it as a LOAD failure.
        /** @var array{code: string, at: string} $want */
        $want = $engine;
        self::assertIsArray($want, "case {$case['name']} engine must be 'pass' | {code, at}");
        self::assertArrayHasKey('code', $want, "case {$case['name']} engine.code missing");
        self::assertArrayHasKey('at', $want, "case {$case['name']} engine.at missing");

        try {
            ListValidate::run($spec, $files);
            self::fail("case {$case['name']} expected load error {$want['code']} at {$want['at']} but loaded successfully");
        } catch (ComposeLoadError $e) {
            self::assertSame($want['code'], $e->code, "error code mismatch for {$case['name']}: {$e->getMessage()}");
            self::assertSame(
                $want['at'],
                \implode('.', $e->trace),
                "error path mismatch for {$case['name']}: {$e->getMessage()}",
            );
        }
    }
}
