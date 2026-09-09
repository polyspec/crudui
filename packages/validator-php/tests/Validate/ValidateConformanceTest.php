<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Tests\Validate;

use CRUDUI\Validator\Compose\ComposeLoadError;
use CRUDUI\Validator;
use PHPUnit\Framework\TestCase;

/**
 * CRUDUI validator conformance (SPEC §2 G5→§3→§2 G1). The shared 4-language
 * fixture tests/fixtures/validate/cases.json is the single truth — its values
 * are the JS reference CRUDUI validator's actual output ({ valid, errors } | a
 * load-error code). PHP loads this ONE file and must reproduce it bit-for-bit
 * (G-B 4-language idempotence): result cases match `expected` (same valid +
 * errors[] including path/field/rule/message/value), error cases throw a
 * ComposeLoadError with the exact `expectLoadError.code`. Never weaken an
 * assertion to turn red green; fix the engine, the fixture, or both at their
 * shared source — not this test.
 */
final class ValidateConformanceTest extends TestCase
{
    private const SHARED_FIXTURE = __DIR__ . '/../../../../tests/fixtures/validate/cases.json';

    /** @return array<string, array{0: array<string, mixed>}> */
    public static function fixtureProvider(): array
    {
        $path = \realpath(self::SHARED_FIXTURE);
        self::assertNotFalse($path, 'shared validate fixture not found: ' . self::SHARED_FIXTURE);
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
    public function testValidateMatchesFixture(array $case): void
    {
        self::assertTrue(
            \array_key_exists('expected', $case) || \array_key_exists('expectLoadError', $case),
            "case {$case['name']} must declare expected or expectLoadError",
        );

        /** @var array<string, mixed> $spec */
        $spec = $case['spec'];
        /** @var array<string, mixed> $data */
        $data = $case['data'] ?? [];
        /** @var array<string, array<string, mixed>>|null $files */
        $files = $case['files'] ?? null;

        if (\array_key_exists('expectLoadError', $case)) {
            /** @var array{code: string} $expect */
            $expect = $case['expectLoadError'];
            try {
                Validator::validate($spec, $data, ['files' => $files ?? []]);
                self::fail("case {$case['name']} expected load error {$expect['code']} but validated successfully");
            } catch (ComposeLoadError $e) {
                self::assertSame(
                    $expect['code'],
                    $e->code,
                    "error code mismatch for {$case['name']}: {$e->getMessage()}",
                );
            }
            return;
        }

        $result = Validator::validate($spec, $data, ['files' => $files ?? []]);

        /** @var array{valid: bool, errors: list<array<string, mixed>>} $expected */
        $expected = $case['expected'];

        self::assertSame(
            self::normalize($expected),
            self::normalize(json_decode(json_encode($result, JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR)),
            "validation result mismatch for {$case['name']}",
        );
    }

    /**
     * Recursively normalize for comparison: canonicalize numbers so int/float
     * spellings match (JSON loses the distinction; e.g. min 10 vs 10.0, qty 5).
     * Associative arrays (error records) keep their keys; lists keep order (the
     * error order IS part of the contract).
     */
    private static function normalize(mixed $v): mixed
    {
        if (\is_array($v)) {
            return \array_map([self::class, 'normalize'], $v);
        }
        if (\is_int($v) || \is_float($v)) {
            return (float) $v;
        }
        return $v;
    }
}
