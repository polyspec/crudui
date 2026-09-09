<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Support;

use stdClass;

/** Preserve JSON object and array types when accepting PHP values. */
final class JsonValue
{
    /** Copy a root object, accepting an empty PHP array for the root. */
    public static function object(array|stdClass $value): stdClass
    {
        if (is_array($value) && $value !== [] && array_is_list($value)) {
            throw new \TypeError('Expected an object');
        }
        return self::copy((object) $value);
    }

    /** Copy JSON values and reject unsupported values or invalid UTF-8 strings and keys. */
    public static function copy(mixed $value, int $depth = 0): mixed
    {
        if ($depth > 512) {
            throw new \InvalidArgumentException('Recursive or excessively nested PHP value');
        }
        if ($value instanceof stdClass || is_array($value)) {
            $object = $value instanceof stdClass || !array_is_list($value);
            $out = $object ? new stdClass() : [];
            foreach ($value as $key => $child) {
                if (is_string($key) && preg_match('//u', $key) !== 1) {
                    throw new \InvalidArgumentException('Object keys must contain valid UTF-8');
                }
                $child = self::copy($child, $depth + 1);
                if ($object) {
                    $out->{(string) $key} = $child;
                } else {
                    $out[] = $child;
                }
            }
            return $out;
        }
        if (is_string($value) && preg_match('//u', $value) !== 1) {
            throw new \InvalidArgumentException('Strings must contain valid UTF-8');
        }
        if ($value === null || is_string($value) || is_bool($value) || is_int($value) || is_float($value) && is_finite($value)) {
            return $value;
        }
        throw new \InvalidArgumentException('Unsupported PHP value: ' . get_debug_type($value));
    }

    /** Identify explicit JSON objects and PHP associative arrays. */
    public static function isObject(mixed $value): bool
    {
        return $value instanceof stdClass || is_array($value) && !array_is_list($value);
    }

    /** Return a structural map without converting its child values. */
    public static function members(mixed $value): array
    {
        return $value instanceof stdClass || is_array($value) ? (array) $value : [];
    }
}
