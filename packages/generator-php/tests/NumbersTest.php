<?php

declare(strict_types=1);

namespace CRUDUI\Generator\Tests;

use PHPUnit\Framework\TestCase;
use CRUDUI\Generator\Numbers;
use CRUDUI\Generator;

final class NumbersTest extends TestCase
{
    public static function fixedCases(): array
    {
        return [[2.5, 0, '3'], [-2.5, 0, '-3'], [1.005, 2, '1.00'], [2.675, 2, '2.67'], [1.25, 1, '1.3'], [-1.25, 1, '-1.3'], [1.0E+21, 2, '1e+21'], [-0.0, 2, '0.00'], [-0.001, 2, '-0.00'], [0.3, 20, '0.29999999999999998890'], [1.0000000000000001E+18, 0, '1000000000000000128'], [4.940656458412465E-324, 2, '0.00']];
    }

    /** @dataProvider fixedCases */
    public function testFixedUsesExactBinaryValue(float $number, int $places, string $expected): void
    {
        self::assertSame($expected, Numbers::fixed($number, $places));
    }

    public function testShortestFormattingUsesDecimalAndExponentThresholds(): void
    {
        foreach ([[1.0E-7, '1e-7'], [1.0E-6, '0.000001'], [1.0E+20, '100000000000000000000'], [1.0E+21, '1e+21'], [-0.0, '0'], [1.2345678901234567, '1.2345678901234567']] as [$number, $expected]) {
            self::assertSame($expected, Numbers::string($number));
        }
    }

    public function testListNumberStringsAndDecimalOptionTypes(): void
    {
        foreach ([['0x10', 2, '16.00'], ['0b101', 0, '5'], ['0o17', 0, '15'], [1.25, '1', '1.25'], ["\u{FEFF}16\u{00A0}", 1, '16.0'], ['1e999', 2, '1e999'], ['-0x10', 2, '-0x10']] as [$value, $places, $expected]) {
            $spec = (object) ['columns' => (object) ['number' => (object) ['field' => '.value', 'format' => (object) ['type' => 'number', 'decimals' => $places]]]];
            $html = Generator::renderList($spec, [(object) ['value' => $value]]);
            self::assertStringContainsString('<td class="crudui-list__cell crudui-value crudui-value--number">' . $expected . '</td>', $html);
        }
    }

    public function testDecimalPrecisionTruncatesBeforeItsRangeIsChecked(): void
    {
        self::assertSame('1.25', Numbers::fixed(1.25, 2.9));
        self::assertSame('1', Numbers::fixed(1.25, -0.9));
        self::assertSame('1.' . str_repeat('0', 100), Numbers::fixed(1.0, 100.9));
        foreach ([-1, 101, 1e200] as $places) {
            try {
                Numbers::fixed(1.0, $places);
                self::fail('Invalid precision must fail');
            } catch (\CRUDUI\FormError $error) {
                self::assertSame('INVALID_FORM_INPUT', $error->getErrorCode());
                self::assertSame('Number decimals must be between 0 and 100', $error->getMessage());
            }
        }
    }
}
