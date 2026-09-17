<?php
declare(strict_types=1);
$orderedJsonSource = getenv('FORM_ORDERED_JSON_PHP_SOURCE');
if ($orderedJsonSource === false) {
    $orderedJsonSource = dirname(__DIR__, 2)
        . '/.form-comparison/sources/ordered-json/php/src/OrderedJson.php';
}
if (!str_starts_with($orderedJsonSource, '/') || !is_file($orderedJsonSource)) {
    throw new RuntimeException('FORM_ORDERED_JSON_PHP_SOURCE must identify the absolute OrderedJSON PHP source file');
}
require_once $orderedJsonSource;

use OrderedJson\Value;

/** Require the configured JSON and CRUDUI extension modes. */
function phpServerMode(): string
{
    $mode = getenv('FORM_PHP_SERVER') ?: 'php';
    if (!in_array($mode, ['php', 'php-ext'], true)) throw new RuntimeException('Unknown PHP server mode');
    if (extension_loaded('ordered_json') !== ($mode === 'php-ext')) throw new RuntimeException('OrderedJSON extension state does not match the selected server');
    if (extension_loaded('crudui') !== ($mode === 'php-ext')) throw new RuntimeException('CRUDUI extension state does not match the selected server');
    return $mode;
}
phpServerMode();

/** Convert ordered JSON values to objects, arrays and scalar values. */
final class FormJson
{
    public static function decode(string $source): mixed
    {
        return self::data(phpServerMode() === 'php-ext'
            ? OrderedJson\parseNative($source)
            : OrderedJson\parse($source, useNative: false));
    }

    public static function encode(mixed $data): string
    {
        return OrderedJson\stringify(self::value($data));
    }

    /** Convert objects only after request shape validation has completed. */
    public static function arrays(mixed $data): mixed
    {
        if ($data instanceof stdClass) $data = get_object_vars($data);
        return is_array($data) ? array_map(self::arrays(...), $data) : $data;
    }

    /** Write one number as JavaScript's Number to String conversion writes it. */
    public static function numberText(int|float $number): string
    {
        if (is_int($number)) return (string) $number;
        if (!is_finite($number)) throw new InvalidArgumentException('JSON numbers are finite');
        if ($number == 0.0) return '0';
        $magnitude = abs($number);
        // The shortest scientific form that reads back as the same binary64 value.
        for ($precision = 0; $precision < 17; $precision++) {
            $scientific = sprintf('%.' . $precision . 'e', $magnitude);
            if ((float) $scientific === $magnitude) break;
        }
        [$mantissa, $exponent] = explode('e', $scientific);
        $digits = str_replace('.', '', $mantissa);
        $count = strlen($digits);
        $point = (int) $exponent + 1;
        $sign = $number < 0 ? '-' : '';
        if ($count <= $point && $point <= 21) return $sign . $digits . str_repeat('0', $point - $count);
        if (0 < $point && $point <= 21) return $sign . substr($digits, 0, $point) . '.' . substr($digits, $point);
        if (-6 < $point && $point <= 0) return $sign . '0.' . str_repeat('0', -$point) . $digits;
        $power = $point - 1;
        return $sign . $digits[0] . ($count > 1 ? '.' . substr($digits, 1) : '')
            . 'e' . ($power < 0 ? '-' : '+') . abs($power);
    }

    private static function data(Value $value): mixed
    {
        return match ($value->kind()) {
            'object' => (object) array_map(self::data(...), $value->members()),
            'array' => array_map(self::data(...), $value->items()),
            'string' => $value->stringValue(),
            'boolean' => $value->booleanValue(),
            'number' => self::number($value->numberLiteral()),
            'null' => null,
        };
    }

    private static function number(string $literal): int|float
    {
        $number = strpbrk($literal, '.eE') === false
            ? filter_var($literal, FILTER_VALIDATE_INT) : (float) $literal;
        if ($number === false || !is_finite((float) $number) || abs($number) > 9007199254740991) {
            throw new InvalidArgumentException('JSON number exceeds the form data range');
        }
        return $number;
    }

    private static function value(mixed $data): Value
    {
        if ($data === null) return Value::null();
        if (is_string($data)) return Value::string($data);
        if (is_bool($data)) return Value::boolean($data);
        if (is_int($data) || is_float($data)) {
            $literal = self::numberText($data);
            self::number($literal);
            return Value::number($literal);
        }
        if ($data instanceof stdClass) return Value::object(array_map(self::value(...), get_object_vars($data)));
        if (is_array($data)) {
            $values = array_map(self::value(...), $data);
            return array_is_list($data) ? Value::array($values) : Value::object($values);
        }
        throw new InvalidArgumentException('Expected JSON form data');
    }
}
