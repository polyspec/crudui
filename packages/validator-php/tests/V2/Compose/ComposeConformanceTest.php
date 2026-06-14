<?php

declare(strict_types=1);

namespace FormSpec\Validator\Tests\V2\Compose;

use FormSpec\Validator\V2\Compose\Compose;
use FormSpec\Validator\V2\Compose\ComposeLoadError;
use FormSpec\Validator\V2\Compose\MemoryLoader;
use PHPUnit\Framework\TestCase;

/**
 * v2 composition-engine conformance (SPEC-V2 §5, G5). The shared 4-language
 * fixture tests/fixtures/compose/cases.json is the single truth — its values are
 * the JS reference engine's actual output (expanded single spec | load-error
 * code). PHP loads this ONE file and must reproduce it bit-for-bit (G-B
 * 4-language idempotence): success cases match `expected`, error cases throw a
 * ComposeLoadError with the exact `expectError.code`. Never weaken an assertion
 * to turn red green; fix the engine, the fixture, or both at their shared source
 * — not this test.
 */
final class ComposeConformanceTest extends TestCase
{
    private const SHARED_FIXTURE = __DIR__ . '/../../../../../tests/fixtures/compose/cases.json';

    /** @return array<string, array{0: array<string, mixed>}> */
    public static function fixtureProvider(): array
    {
        $path = \realpath(self::SHARED_FIXTURE);
        self::assertNotFalse($path, 'shared compose fixture not found: ' . self::SHARED_FIXTURE);
        $raw = \file_get_contents($path);
        self::assertNotFalse($raw);
        /** @var list<array<string, mixed>> $specs */
        $specs = \json_decode($raw, true, 512, JSON_THROW_ON_ERROR);

        $out = [];
        foreach ($specs as $spec) {
            $out[$spec['name']] = [$spec];
        }
        return $out;
    }

    /**
     * @dataProvider fixtureProvider
     * @param array<string, mixed> $spec
     */
    public function testComposeMatchesFixture(array $spec): void
    {
        /** @var array<string, mixed> $input */
        $input = $spec['input'];
        /** @var array<string, array<string, mixed>> $files */
        $files = $input['files'] ?? [];
        $loader = new MemoryLoader($files);
        $kind = $input['kind'] ?? 'properties';
        $basepath = $input['basepath'] ?? '';
        /** @var array<string, mixed> $entry */
        $entry = $input['entry'];

        if (\array_key_exists('expectError', $spec)) {
            /** @var array{code: string} $expectError */
            $expectError = $spec['expectError'];
            try {
                $kind === 'spec'
                    ? Compose::spec($entry, $loader, $basepath)
                    : Compose::properties($entry, $loader, $basepath);
                self::fail("case {$spec['name']} expected load error {$expectError['code']} but composed successfully");
            } catch (ComposeLoadError $e) {
                self::assertSame(
                    $expectError['code'],
                    $e->code,
                    "error code mismatch for {$spec['name']}: {$e->getMessage()}",
                );
            }
            return;
        }

        $result = $kind === 'spec'
            ? Compose::spec($entry, $loader, $basepath)
            : Compose::properties($entry, $loader, $basepath);

        self::assertSame(
            self::normalize($spec['expected']),
            self::normalize($result),
            "composed spec mismatch for {$spec['name']}",
        );
    }

    /**
     * Recursively normalize for comparison: ksort associative arrays (key order
     * is not part of the cross-language contract — JS uses insertion order, PHP
     * preserves it, Go is alphabetical) and canonicalize numbers so int/float
     * spellings match (JSON loses the distinction).
     */
    private static function normalize(mixed $v): mixed
    {
        if (\is_array($v)) {
            if (\array_is_list($v)) {
                return \array_map([self::class, 'normalize'], $v);
            }
            $copy = $v;
            \ksort($copy);
            return \array_map([self::class, 'normalize'], $copy);
        }
        if (\is_int($v) || \is_float($v)) {
            return (float) $v;
        }
        return $v;
    }
}
