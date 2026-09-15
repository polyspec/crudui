<?php

declare(strict_types=1);

namespace CRUDUI\Generator\Tests;

use CRUDUI\FormError;
use CRUDUI\Generator;
use PHPUnit\Framework\TestCase;
use stdClass;

/** List and detail input, text truncation and number decimal rules of docs/spec/display-formats.md. */
final class DisplayRulesTest extends TestCase
{
    private const SPEC = ['columns' => ['v' => ['field' => '.v', 'label' => 'V']]];

    private static function assertFailure(string $message, callable $operation): void
    {
        try {
            $operation();
        } catch (FormError $error) {
            self::assertSame(['INVALID_FORM_INPUT', $message, ''], [$error->getErrorCode(), $error->getMessage(), $error->getPath()]);
            return;
        }
        self::fail('Expected failure: ' . $message);
    }

    public function testAnEmptyArraySpecificationIsTheEmptyRootObject(): void
    {
        self::assertSame('<div class="list-view"><div class="list-empty"></div></div>', Generator::renderList([], []));
    }

    public function testRejectsAListShapedSpecification(): void
    {
        self::assertFailure('List specification must be an object', fn () => Generator::renderList([['columns']], []));
    }

    public function testRowsMustBeAListOfObjects(): void
    {
        self::assertFailure('List rows must be an array', fn () => Generator::renderList(self::SPEC, ['a' => ['v' => 1]]));
        foreach ([[1], [[]], [['a']], [null]] as $rows) {
            self::assertFailure('List rows must be objects', fn () => Generator::renderList(self::SPEC, $rows));
        }
        self::assertStringContainsString('>1</td>', Generator::renderList(self::SPEC, [['v' => 1], (object) ['v' => 2]]));
    }

    public function testContextAndPageMetadataAreFixedObjectOptions(): void
    {
        $table = Generator::renderList(self::SPEC, [['v' => 'a']]);
        foreach ([['data' => []], ['data' => null], ['data' => new stdClass()], ['pageMeta' => []], ['pageMeta' => null], ['layout' => null]] as $options) {
            self::assertSame($table, Generator::renderList(self::SPEC, [['v' => 'a']], $options));
        }
        foreach ([['x'], 'x', 1, true] as $value) {
            self::assertFailure('List context must be an object', fn () => Generator::renderList(self::SPEC, [], ['data' => $value]));
            self::assertFailure('List page metadata must be an object', fn () => Generator::renderList(self::SPEC, [], ['pageMeta' => $value]));
        }
    }

    public function testLayoutMustBeTableOrCard(): void
    {
        foreach (['grid', '', 5, ['table']] as $layout) {
            self::assertFailure('List layout must be table or card', fn () => Generator::renderList(self::SPEC, [], ['layout' => $layout]));
        }
        self::assertStringContainsString('list-cards', Generator::renderList(self::SPEC, [['v' => 'a']], ['layout' => 'card']));
    }

    public function testListInputIsCheckedInOrder(): void
    {
        self::assertFailure('List rows must be objects', fn () => Generator::renderList(self::SPEC, [1], ['data' => 1, 'pageMeta' => 1, 'layout' => 'grid']));
        self::assertFailure('List context must be an object', fn () => Generator::renderList(self::SPEC, [], ['data' => 1, 'pageMeta' => 1, 'layout' => 'grid']));
        self::assertFailure('List page metadata must be an object', fn () => Generator::renderList(self::SPEC, [], ['pageMeta' => 1, 'layout' => 'grid']));
    }

    public function testDetailContextIsAFixedObjectOptionCheckedAfterTheFields(): void
    {
        self::assertSame('<dl class="detail-view"></dl>', Generator::renderDetail(['fields' => []], [], ['data' => []]));
        self::assertSame('<dl class="detail-view"></dl>', Generator::renderDetail(['fields' => []], [], ['data' => null]));
        foreach ([['x'], 'x', 1] as $value) {
            self::assertFailure('Detail context must be an object', fn () => Generator::buildDetail(['fields' => []], [], ['data' => $value]));
        }
        self::assertFailure('Detail specification must declare fields', fn () => Generator::renderDetail([], [], ['data' => 1]));
        self::assertFailure('Detail record must be an object', fn () => Generator::renderDetail(['fields' => []], ['a'], ['data' => 1]));
    }

    private static function display(array $format, mixed $value): mixed
    {
        return Generator::buildDetail(['fields' => ['v' => ['field' => '.v', 'format' => $format]]], ['v' => $value])->fields[0]->display;
    }

    public static function truncations(): array
    {
        return [
            'astral character' => [2, 'a😀bc', 'a😀…'],
            'hangul' => [3, '가나다라마', '가나다…'],
            'numeric string' => ['2', 'abcd', 'abcd'],
            'below one' => [0.5, 'abc', 'abc'],
            'fraction' => [2.9, 'abcd', 'ab…'],
            'equal length' => [4, 'abcd', 'abcd'],
            'zero' => [0, 'abcd', 'abcd'],
            'negative' => [-1, 'abcd', 'abcd'],
            'huge' => [1e300, 'abcd', 'abcd'],
        ];
    }

    /** @dataProvider truncations */
    public function testTruncationKeepsWholeCodePoints(mixed $limit, string $value, string $expected): void
    {
        self::assertSame($expected, self::display(['type' => 'text', 'truncate' => $limit], $value));
    }

    public function testTruncatedDetailMarkup(): void
    {
        self::assertSame(
            '<dl class="detail-view"><div class="detail-field"><dt class="detail-label">V</dt><dd class="detail-value detail-value-text">a😀…</dd></div></dl>',
            Generator::renderDetail(['fields' => ['v' => ['field' => '.v', 'label' => 'V', 'format' => ['type' => 'text', 'truncate' => 2]]]], ['v' => 'a😀bc']),
        );
    }

    public function testDecimalsRange(): void
    {
        self::assertSame('1.' . str_repeat('0', 100), self::display(['type' => 'number', 'decimals' => 100], 1));
        self::assertSame('1', self::display(['type' => 'number', 'decimals' => '101'], 1));
        // Infinity and NaN are not JSON values; PHP inputs reject them before formatting.
        foreach ([101, -1, 1e200, -1e200] as $places) {
            self::assertFailure('Number decimals must be between 0 and 100', fn () => self::display(['type' => 'number', 'decimals' => $places], 1));
        }
    }
}
