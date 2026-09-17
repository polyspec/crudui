<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Tests\Validate;

use CRUDUI\Validator;
use CRUDUI\Validator\Compose\ComposeLoadError;
use CRUDUI\Validator\Support\JsonText;
use CRUDUI\Validator\Support\Text;
use CRUDUI\Validator\Validate\FormInputError;
use PHPUnit\Framework\TestCase;
use stdClass;

require_once __DIR__ . '/../../../../tests/conformance/evidence.php';

/**
 * Input text conformance (docs/spec/input-text.md). The validation families of
 * tests/fixtures/text-validity are JSON text with unpaired surrogate escapes; JsonText decodes
 * them into strings that are not valid UTF-8, and the validator reports the failure each case
 * declares. Byte strings that JSON text cannot carry are checked here directly.
 */
final class TextValidityConformanceTest extends TestCase
{
    /** @return array<string, array{0: string, 1: stdClass}> */
    public static function fixtureProvider(): array
    {
        $out = [];
        foreach (['validate', 'validateList', 'validateDetail'] as $feature) {
            $raw = \file_get_contents(__DIR__ . "/../../../../tests/fixtures/text-validity/{$feature}/cases.json");
            self::assertIsString($raw);
            foreach (JsonText::decode($raw) as $case) {
                $out["{$feature}/{$case->name}"] = [$feature, $case];
            }
        }
        return $out;
    }

    private static function outcome(callable $run): mixed
    {
        try {
            return \json_decode(\json_encode($run(), JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR);
        } catch (ComposeLoadError $error) {
            return ['code' => $error->getErrorCode(), 'message' => $error->getMessage(), 'at' => \implode('.', $error->getCompositionTrace())];
        } catch (FormInputError $error) {
            return ['code' => $error->getErrorCode(), 'message' => $error->getMessage(), 'at' => ''];
        }
    }

    /** @dataProvider fixtureProvider */
    public function testInputTextMatchesFixture(string $feature, stdClass $case): void
    {
        self::assertFalse((new \ReflectionClass(Validator::class))->isInternal(), 'PHPUnit evidence proves the pure PHP runtime, not the native extension');
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
                'validate' => static fn () => Validator::validate($case->spec, $rootString ? [$case->data] : $case->data, $options),
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
            crudui_record_conformance($feature, "tests/fixtures/text-validity/{$feature}/cases.json", 'php', $case->name, $passed);
        }
    }

    public function testInvalidUtf8Bytes(): void
    {
        $spec = static fn (string $label) => (object) ['type' => 'group', 'properties' => (object) ['name' => (object) ['type' => 'text', 'label' => $label]]];
        $sequences = [
            'lone byte' => \chr(0xff),
            'continuation' => 'a' . \chr(0x80),
            'truncated' => \chr(0xe2) . \chr(0x82),
            'overlong' => \chr(0xc0) . \chr(0xaf),
            'encoded surrogate' => \chr(0xed) . \chr(0xa0) . \chr(0x80),
            'above U+10FFFF' => \chr(0xf4) . \chr(0x90) . \chr(0x80) . \chr(0x80),
        ];
        foreach ($sequences as $name => $bytes) {
            self::assertFalse(Text::isScalar($bytes), $name);
            self::assertSame(['code' => 'INVALID_TEXT', 'message' => Text::MESSAGE, 'at' => 'properties.name.label'], self::outcome(static fn () => Validator::validate($spec('A' . $bytes), [])), $name);
            self::assertSame(['code' => 'INVALID_FORM_INPUT', 'message' => Text::MESSAGE . ': data.rows.1', 'at' => ''], self::outcome(static fn () => Validator::validate($spec('A'), ['rows' => ['ok', [$bytes => 1]]])), $name);
            self::assertSame(['code' => 'INVALID_TEXT', 'message' => Text::MESSAGE, 'at' => ''], self::outcome(static fn () => Validator::validateList(['columns' => []], ['files' => [$bytes => new stdClass()]])), $name);
            self::assertSame(['code' => 'INVALID_FORM_INPUT', 'message' => Text::MESSAGE . ': options.basepath', 'at' => ''], self::outcome(static fn () => Validator::validateDetail(['fields' => []], ['basepath' => $bytes])), $name);
        }
        $bad = \chr(0xff);
        // Integer member names are decimal names in code point order: "10" precedes "9".
        self::assertSame(['10'], Text::invalidPath((object) ['9' => $bad, '10' => $bad]));
        self::assertSame(['10'], Text::invalidPath([9 => ['a' => $bad], 10 => $bad]));
        self::assertSame(['1'], Text::invalidPath(['ok', $bad]));
        self::assertSame(['0', 'a', '0', 'b'], Text::invalidPath([(object) ['a' => [(object) ['b' => $bad]]]]));
        $shared = (object) ['b' => $bad];
        self::assertSame(['y', 'b'], Text::invalidPath((object) ['y' => $shared, 'z' => $shared]));
        // A value that contains itself is not searched forever.
        $cyclic = new stdClass();
        $cyclic->self = $cyclic;
        self::assertNull(Text::invalidPath($cyclic));
    }

    public function testJsonTextDecodesAsJsonDecode(): void
    {
        $same = ['{"a":[1,-2.5e3,0,true,false,null,{"b":"\u00e9\ud83d\ude00\n\/"}],"a":"last","":{}}', ' [ ] ', '123', '"\u0000"', '12345678901234567890', '{"_empty_":1}'];
        foreach ($same as $json) {
            self::assertEquals(\json_decode($json, false, 512, JSON_THROW_ON_ERROR), JsonText::decode($json), $json);
        }
        $surrogate = \chr(0xed) . \chr(0xa0) . \chr(0x80);
        $low = \chr(0xed) . \chr(0xb0) . \chr(0x80);
        self::assertSame($surrogate . 'A' . $low . $surrogate . \chr(0xff), JsonText::decode('"\ud800A\udc00\ud800' . \chr(0xff) . '"'));
        $decoded = JsonText::decode('{"\ud800":{"\ud800":[1,"x"]}}');
        self::assertSame([1, 'x'], $decoded->{$surrogate}->{$surrogate});
        $rejected = ['', '{', '[1,]', '01', '"\x"', '"a' . \chr(1) . '"', '{} {}', '"\ud800', '{"\u0000a":"\ud800"}', \str_repeat('[', 512) . '"\ud800"' . \str_repeat(']', 512)];
        foreach ($rejected as $json) {
            try {
                JsonText::decode($json);
                self::fail("accepted {$json}");
            } catch (\JsonException) {
                self::addToAssertionCount(1);
            }
        }
        self::assertIsArray(JsonText::decode(\str_repeat('[', 511) . '"\ud800"' . \str_repeat(']', 511)));
    }
}
