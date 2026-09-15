<?php

declare(strict_types=1);

namespace CRUDUI\Generator\Tests;

use CRUDUI\FormError;
use CRUDUI\Generator;
use CRUDUI\Validator\Compose\ComposeLoadError;
use PHPUnit\Framework\TestCase;
use stdClass;

/** List and detail input, text truncation and number decimal rules of docs/spec/display-formats.md. */
final class DisplayRulesTest extends TestCase
{
    private const SPEC = ['columns' => ['v' => ['field' => 'v', 'label' => 'V']]];

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
        self::assertSame('<div class="crudui-list"><div class="crudui-list__empty"></div></div>', Generator::renderList([], []));
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

    public function testContextIsAFixedObjectOption(): void
    {
        $table = Generator::renderList(self::SPEC, [['v' => 'a']]);
        foreach ([['data' => []], ['data' => null], ['data' => new stdClass()], ['page' => null], ['total' => null], ['layout' => null]] as $options) {
            self::assertSame($table, Generator::renderList(self::SPEC, [['v' => 'a']], $options));
        }
        foreach ([['x'], 'x', 1, true] as $value) {
            self::assertFailure('List context must be an object', fn () => Generator::renderList(self::SPEC, [], ['data' => $value]));
        }
    }

    public function testPageAndTotalAreSafeIntegers(): void
    {
        $spec = [...self::SPEC, 'pagination' => true];
        $nav = fn (array $options) => substr(Generator::renderList($spec, [], $options), strlen('<div class="crudui-list"><div class="crudui-list__empty"></div>'), -strlen('</div>'));
        self::assertSame('<nav class="crudui-list__pagination"></nav>', $nav([]));
        self::assertSame('<nav class="crudui-list__pagination" data-page="2" data-total="99"></nav>', $nav(['page' => 2, 'total' => 99]));
        self::assertSame('<nav class="crudui-list__pagination" data-page="2" data-total="0"></nav>', $nav(['page' => 2.0, 'total' => -0.0]));
        self::assertSame('<nav class="crudui-list__pagination" data-page="9007199254740991" data-total="9007199254740991"></nav>', $nav(['page' => 9007199254740991, 'total' => 9007199254740991.0]));
        self::assertSame('<nav class="crudui-list__pagination" data-page="1"></nav>', $nav(['page' => 1, 'total' => null]));
        self::assertSame('<nav class="crudui-list__pagination" data-total="0"></nav>', $nav(['total' => 0]));
        foreach (['2', true, false, [], [2], new stdClass(), 1.5, 0, 0.0, -1, 9007199254740992, 9007199254740992.0, PHP_INT_MAX, INF, NAN] as $value) {
            self::assertFailure('List page must be a positive integer', fn () => Generator::renderList($spec, [], ['page' => $value]));
        }
        foreach (['0', true, [], new stdClass(), 2.5, -1, -1.0, 9007199254740992, INF, -INF, NAN] as $value) {
            self::assertFailure('List total must be a nonnegative integer', fn () => Generator::renderList($spec, [], ['total' => $value]));
        }
        // The detail model neither checks nor uses the list page options.
        self::assertSame('<dl class="crudui-detail"></dl>', Generator::renderDetail(['fields' => []], [], ['page' => 'x', 'total' => -1]));
    }

    public function testLayoutMustBeTableOrCard(): void
    {
        foreach (['grid', '', 5, ['table']] as $layout) {
            self::assertFailure('List layout must be table or card', fn () => Generator::renderList(self::SPEC, [], ['layout' => $layout]));
        }
        self::assertStringContainsString('crudui-list__cards', Generator::renderList(self::SPEC, [['v' => 'a']], ['layout' => 'card']));
    }

    public function testListInputIsCheckedInOrder(): void
    {
        $all = ['data' => 1, 'page' => 0, 'total' => -1, 'layout' => 'grid'];
        self::assertFailure('List specification must be an object', fn () => Generator::renderList([1], ['a' => 1], $all));
        self::assertFailure('List rows must be an array', fn () => Generator::renderList(self::SPEC, ['a' => 1], $all));
        self::assertFailure('List rows must be objects', fn () => Generator::renderList(self::SPEC, [1], $all));
        self::assertFailure('List context must be an object', fn () => Generator::renderList(self::SPEC, [], $all));
        self::assertFailure('List page must be a positive integer', fn () => Generator::renderList(self::SPEC, [], ['page' => 0, 'total' => -1, 'layout' => 'grid']));
        self::assertFailure('List total must be a nonnegative integer', fn () => Generator::renderList(self::SPEC, [], ['total' => -1, 'layout' => 'grid']));
    }

    public function testDetailContextIsAFixedObjectOptionCheckedAfterTheFields(): void
    {
        self::assertSame('<dl class="crudui-detail"></dl>', Generator::renderDetail(['fields' => []], [], ['data' => []]));
        self::assertSame('<dl class="crudui-detail"></dl>', Generator::renderDetail(['fields' => []], [], ['data' => null]));
        foreach ([['x'], 'x', 1] as $value) {
            self::assertFailure('Detail context must be an object', fn () => Generator::buildDetail(['fields' => []], [], ['data' => $value]));
        }
        self::assertFailure('Detail specification must declare fields', fn () => Generator::renderDetail([], [], ['data' => 1]));
        self::assertFailure('Detail record must be an object', fn () => Generator::renderDetail(['fields' => []], ['a'], ['data' => 1]));
    }

    public function testListAndDetailDesignsFollowTheFormDeclarationRules(): void
    {
        $column = fn (array $design) => ['columns' => ['name' => ['field' => 'name', 'design' => $design]]];
        self::assertFailure('Invalid design.main at columns.name: unknown key', fn () => Generator::renderList($column(['main' => ['class' => 'x']]), []));
        self::assertFailure('Invalid design.color at list: unknown key', fn () => Generator::renderList(['design' => ['color' => 'red'], 'columns' => ['name' => ['design' => ['main' => (object) []]]]], []));
        self::assertFailure('Invalid design.show at columns.name: expected an expression, a boolean or a condition map', fn () => Generator::renderList($column(['show' => 1]), []));
        $field = ['fields' => ['name' => ['field' => 'name', 'design' => ['label' => ['text' => 'x']]]]];
        self::assertFailure('Invalid design.label.text at fields.name: unknown key', fn () => Generator::renderDetail($field, []));
        self::assertFailure('Invalid design.label.text at fields.name: unknown key', fn () => Generator::buildDetail($field, []));
        self::assertFailure('Invalid design.wrapper at detail: expected an object', fn () => Generator::renderDetail(['design' => ['wrapper' => 'box'], 'fields' => []], []));
        self::assertFailure('Invalid design.wrapper at detail: expected an object', fn () => Generator::buildDetail(['design' => ['wrapper' => 'box'], 'fields' => []], []));
        // Declared designs that follow the rules render.
        self::assertStringContainsString('crudui-list box', Generator::renderList(['design' => ['wrapper' => ['class' => 'box']], 'columns' => ['name' => ['design' => ['show' => true, 'class' => 'c']]]], []));
    }

    public function testDesignDeclarationsAreCheckedInOrder(): void
    {
        // The own design, then each column or field in member order.
        self::assertFailure('Invalid design at list: expected a boolean or an object', fn () => Generator::renderList(['columns' => ['a' => ['design' => ['x' => 1]]], 'design' => 'x'], []));
        self::assertFailure('Invalid design.x at columns.a: unknown key', fn () => Generator::renderList(['columns' => ['a' => ['design' => ['x' => 1]], 'b' => ['design' => 1]]], []));
        self::assertFailure('Invalid design at fields.b: expected a boolean or an object', fn () => Generator::buildDetail(['fields' => ['a' => ['design' => false], 'b' => ['design' => null], 'c' => ['design' => ['x' => 1]]]], []));
        // Within one design: closed keys in member order, then show, class and style, then each node.
        self::assertFailure('Invalid design.text at columns.a: unknown key', fn () => Generator::renderList(['columns' => ['a' => ['design' => ['show' => 1, 'text' => 1]]]], []));
        self::assertFailure('Invalid design.style at columns.a: expected a string or a condition map', fn () => Generator::renderList(['columns' => ['a' => ['design' => ['label' => 1, 'style' => 1]]]], []));
        self::assertFailure('Invalid design.label.text at detail: unknown key', fn () => Generator::renderDetail(['design' => ['label' => ['class' => 1, 'text' => 'x']], 'fields' => []], []));
        self::assertFailure('Invalid design.group.class at detail: expected a string or a condition map', fn () => Generator::renderDetail(['design' => ['group' => ['class' => []], 'prepend' => 1], 'fields' => []], []));
        // Input rules come before the declarations.
        $invalid = ['design' => 1, 'columns' => ['a' => ['design' => 1]]];
        self::assertFailure('List rows must be objects', fn () => Generator::renderList($invalid, [1]));
        self::assertFailure('List context must be an object', fn () => Generator::renderList($invalid, [], ['data' => 1]));
        self::assertFailure('List page must be a positive integer', fn () => Generator::renderList($invalid, [], ['page' => 0]));
        self::assertFailure('List total must be a nonnegative integer', fn () => Generator::renderList($invalid, [], ['total' => -1]));
        self::assertFailure('List layout must be table or card', fn () => Generator::renderList($invalid, [], ['layout' => 'grid']));
        self::assertFailure('Detail record must be an object', fn () => Generator::renderDetail(['design' => 1, 'fields' => []], ['a']));
        self::assertFailure('Detail context must be an object', fn () => Generator::buildDetail(['design' => 1, 'fields' => []], [], ['data' => 1]));
        // Composition load failures come before the declarations; composed designs are checked.
        foreach ([fn () => Generator::renderList(['design' => 1, 'columns' => ['$ref' => 'absent.yml']], []), fn () => Generator::buildDetail(['design' => 1, 'fields' => ['$ref' => 'absent.yml']], [])] as $operation) {
            try {
                $operation();
                self::fail('Expected a composition failure');
            } catch (ComposeLoadError $error) {
                self::assertSame('REF_FILE_NOT_FOUND', $error->getErrorCode());
            }
        }
        self::assertFailure('Invalid design.main at fields.name: unknown key', fn () => Generator::renderDetail(['fields' => ['name' => ['$ref' => 'name.yml']]], [], ['files' => ['name.yml' => ['properties' => ['design' => ['main' => ['class' => 'x']]]]]]));
    }

    private static function display(array $format, mixed $value): mixed
    {
        return Generator::buildDetail(['fields' => ['v' => ['field' => 'v', 'format' => $format]]], ['v' => $value])->fields[0]->display;
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
            '<dl class="crudui-detail"><div class="crudui-detail__field"><dt class="crudui-detail__label">V</dt><dd class="crudui-detail__value crudui-value crudui-value--text">a😀…</dd></div></dl>',
            Generator::renderDetail(['fields' => ['v' => ['field' => 'v', 'label' => 'V', 'format' => ['type' => 'text', 'truncate' => 2]]]], ['v' => 'a😀bc']),
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
