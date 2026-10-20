<?php

declare(strict_types=1);

namespace Polyspec\Crudui\Validator\Tests\Validate;

use Polyspec\Crudui\Validator;
use Polyspec\Crudui\Validator\Compose\ComposeLoadError;
use Polyspec\Crudui\Validator\Validate\FormInputError;
use PHPUnit\Framework\TestCase;
use stdClass;
use PHPUnit\Framework\Attributes\DataProvider;
use Polyspec\Crudui\Conformance\Evidence;

/**
 * Input text conformance (docs/spec/input-text.md). The validation families of
 * tests/fixtures/text-validity are JSON text with unpaired surrogate escapes; decodeFixture
 * decodes them into strings that are not valid UTF-8, and the validator reports the failure each
 * case declares. Byte strings that JSON text cannot carry are checked here directly.
 */
final class TextValidityConformanceTest extends TestCase
{
    /** @return array<string, array{0: string, 1: stdClass}> */
    public static function fixtureProvider(): array
    {
        $out = [];
        foreach (['validate', 'validateList', 'validateDetail'] as $feature) {
            $raw = \file_get_contents(__DIR__ . "/../../../../../tests/fixtures/text-validity/{$feature}/cases.json");
            self::assertIsString($raw);
            foreach (self::decodeFixture($raw) as $case) {
                $out["{$feature}/{$case->name}"] = [$feature, $case];
            }
        }
        return $out;
    }

    /**
     * Decodes fixture JSON text as json_decode($json, false, 512, JSON_THROW_ON_ERROR) does, except that
     * an unpaired surrogate escape becomes the three-byte encoding of that surrogate, which json_decode
     * rejects (JSON_ERROR_UTF16). Each unpaired escape is first rewritten to a private-use code point
     * U+F800 to U+FFFF (U+F800 + the surrogate - U+D800), which json_decode accepts; after decoding, each
     * such code point of a string or member name is written back as the surrogate. The fixture text
     * holds no such code point, which is checked, so every one found is such an escape. Nothing is replaced.
     */
    private static function decodeFixture(string $raw): mixed
    {
        self::assertSame(0, \preg_match('/\\\\u[fF][89a-fA-F][0-9a-fA-F]{2}/', $raw), 'the fixture holds no private-use escape');
        self::assertSame(0, \preg_match('/\\xEF[\\xA0-\\xBF]/', $raw), 'the fixture holds no private-use character');
        $marked = \preg_replace_callback(
            '/\\\\u[dD][89a-fA-F][0-9a-fA-F]{2}\\\\u[dD][c-fC-F][0-9a-fA-F]{2}|\\\\u([dD][89a-fA-F][0-9a-fA-F]{2})|\\\\./',
            static fn (array $match): string => isset($match[1])
                ? '\\u' . \dechex(0xF800 + \hexdec($match[1]) - 0xD800)
                : $match[0],
            $raw
        );
        return self::restoreSurrogates(\json_decode($marked, false, 512, JSON_THROW_ON_ERROR));
    }

    private static function restoreSurrogates(mixed $value): mixed
    {
        if (\is_string($value)) {
            return \preg_replace_callback(
                '/\\xEF[\\xA0-\\xBF][\\x80-\\xBF]/',
                static function (array $match): string {
                    $code = ((\ord($match[0][0]) & 0x0F) << 12) | ((\ord($match[0][1]) & 0x3F) << 6) | (\ord($match[0][2]) & 0x3F);
                    $unit = 0xD800 + $code - 0xF800;
                    return \chr(0xE0 | $unit >> 12) . \chr(0x80 | $unit >> 6 & 0x3F) . \chr(0x80 | $unit & 0x3F);
                },
                $value
            );
        }
        if (\is_array($value)) {
            return \array_map(self::restoreSurrogates(...), $value);
        }
        if ($value instanceof stdClass) {
            $out = new stdClass();
            foreach (\get_object_vars($value) as $name => $member) {
                $out->{self::restoreSurrogates((string) $name)} = self::restoreSurrogates($member);
            }
            return $out;
        }
        return $value;
    }

    private static function outcome(callable $run): mixed
    {
        try {
            return \json_decode(\json_encode($run(), JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR);
        } catch (ComposeLoadError $error) {
            return [
                'code' => $error->getErrorCode(),
                'message' => $error->getMessage(),
                'at' => \implode('.', $error->getCompositionTrace())
            ];
        } catch (FormInputError $error) {
            return ['code' => $error->getErrorCode(), 'message' => $error->getMessage(), 'at' => ''];
        }
    }

    #[DataProvider('fixtureProvider')]
    public function testInputTextMatchesFixture(string $feature, stdClass $case): void
    {
        $passed = false;
        try {
            $options = (array) ($case->options ?? []);
            if (\property_exists($case, 'files')) {
                $options['files'] = $case->files;
            }
            // A PHP data argument is an array or an object: a root string is passed as the
            // list [string], whose item is located at data.0.
            $rootString = \is_string($case->data ?? null);
            $actual = self::outcome(match ($feature) {
                'validate' => static fn () => Validator::validate(
                    $case->spec,
                    $rootString ? [$case->data] : $case->data,
                    $options
                ),
                'validateList' => static fn () => Validator::validateList($case->spec, $options),
                default => static fn () => Validator::validateDetail($case->spec, $options),
            });
            $expected = \json_decode(\json_encode($case->expect, JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR);
            if ($rootString) {
                $expected['message'] .= '.0';
            }
            self::assertSame($expected, $actual);
            $passed = true;
        } finally {
            Evidence::record(
                $feature,
                "tests/fixtures/text-validity/{$feature}/cases.json",
                'php',
                $case->name,
                $passed
            );
        }
    }

    /** @return array<string, array{0: stdClass}> */
    public static function graphProvider(): array
    {
        $raw = \file_get_contents(__DIR__ . '/../../../../../tests/fixtures/text-validity/value-graphs.json');
        self::assertIsString($raw);
        $out = [];
        foreach (self::decodeFixture($raw) as $case) {
            $out[$case->name] = [$case];
        }
        return $out;
    }

    /** A value graph of the fixture, built with shared arrays and references. */
    private static function graph(stdClass $graph): mixed
    {
        if ($graph->shape === 'self-twice') {
            $loop = [];
            $loop['self'] = &$loop;
            $loop['again'] = &$loop;
            return $loop;
        }
        if ($graph->shape === 'flat') {
            return \array_fill(0, $graph->size, $graph->leaf);
        }
        $value = $graph->leaf;
        for ($i = 0; $i < $graph->size; $i++) {
            $value = $graph->shape === 'doubled' ? [$value, $value] : [$value];
        }
        return $value;
    }

    /**
     * Value limits (docs/spec/input-text.md): the cases of tests/fixtures/text-validity/value-graphs.json
     * each finish within the runner's per-test limit; a walk that grows with the tree a value
     * denotes (2^40 nodes) does not.
     */
    #[DataProvider('graphProvider')]
    public function testValueGraphMatchesFixture(stdClass $case): void
    {
        $inputs = ['spec' => $case->spec, 'files' => $case->files ?? null, 'data' => $case->data];
        [$name, $member] = [$case->graph->at[0], \array_slice($case->graph->at, 1)];
        $target = $inputs[$name];
        foreach (\array_slice($member, 0, -1) as $segment) {
            $target = $target->{$segment};
        }
        $target->{\end($member)} = self::graph($case->graph);
        $options = $inputs['files'] === null ? [] : ['files' => $inputs['files']];
        $actual = self::outcome(static fn () => Validator::validate($inputs['spec'], $inputs['data'], $options));
        self::assertSame(
            \json_decode(\json_encode($case->expect, JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR),
            $actual
        );
    }

    public function testInvalidUtf8Bytes(): void
    {
        $spec = static fn (string $label) => (object) [
            'type' => 'group',
            'properties' => (object) ['name' => (object) ['type' => 'text', 'label' => $label]]
        ];
        $sequences = [
            'lone byte' => \chr(0xff),
            'continuation' => 'a' . \chr(0x80),
            'truncated' => \chr(0xe2) . \chr(0x82),
            'overlong' => \chr(0xc0) . \chr(0xaf),
            'encoded surrogate' => \chr(0xed) . \chr(0xa0) . \chr(0x80),
            'above U+10FFFF' => \chr(0xf4) . \chr(0x90) . \chr(0x80) . \chr(0x80),
        ];
        foreach ($sequences as $name => $bytes) {
            self::assertSame(
                ['code' => 'INVALID_TEXT', 'message' => 'Text must be Unicode scalar values', 'at' => 'properties.name.label'],
                self::outcome(static fn () => Validator::validate($spec('A' . $bytes), [])),
                $name
            );
            self::assertSame(
                ['code' => 'INVALID_FORM_INPUT', 'message' => 'Text must be Unicode scalar values' . ': data.rows.1', 'at' => ''],
                self::outcome(static fn () => Validator::validate($spec('A'), ['rows' => ['ok', [$bytes => 1]]])),
                $name
            );
            self::assertSame(
                ['code' => 'INVALID_TEXT', 'message' => 'Text must be Unicode scalar values', 'at' => ''],
                self::outcome(static fn () => Validator::validateList(
                    ['columns' => []],
                    ['files' => [$bytes => new stdClass()]]
                )),
                $name
            );
            self::assertSame(
                ['code' => 'INVALID_FORM_INPUT', 'message' => 'Text must be Unicode scalar values' . ': options.basepath', 'at' => ''],
                self::outcome(static fn () => Validator::validateDetail(['fields' => []], ['basepath' => $bytes])),
                $name
            );
        }
    }
}
