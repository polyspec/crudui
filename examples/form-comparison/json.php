<?php
declare(strict_types=1);
require_once '/workspace/ordered-json/php/src/SortJson.php';

use SortJson\Value;

/** Convert ordered JSON values to the example's record and validator types. */
final class FormJson
{
    public static function decode(string $source): mixed
    {
        return self::data(SortJson\parse($source, useNative: false));
    }

    public static function encode(mixed $data): string
    {
        return SortJson\stringify(self::value($data));
    }

    /** Convert objects only after request shape validation has completed. */
    public static function arrays(mixed $data): mixed
    {
        if ($data instanceof stdClass) $data = get_object_vars($data);
        return is_array($data) ? array_map(self::arrays(...), $data) : $data;
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
            $literal = is_int($data) ? (string) $data : json_encode($data, JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION);
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
