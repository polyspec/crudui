<?php

declare(strict_types=1);

namespace CRUDUI\Generator;

use CRUDUI\FormError;
use CRUDUI\Validator\Support\JsonValue;
use stdClass;

/** Preserve JSON values and resolve form paths and presentation strings. */
final class Value
{
    /** Copy a PHP root record as a JSON object. */
    public static function object(array|stdClass $value): stdClass
    {
        try {
            return JsonValue::object($value);
        } catch (\TypeError|\InvalidArgumentException $error) {
            throw new FormError('INVALID_FORM_INPUT', $error->getMessage());
        }
    }

    /** Return a detached JSON value while preserving object and array types. */
    public static function copy(mixed $value): mixed
    {
        try {
            return JsonValue::copy($value);
        } catch (\InvalidArgumentException $error) {
            throw new FormError('INVALID_FORM_INPUT', $error->getMessage());
        }
    }

    /** Read one own member or return the missing-value marker. */
    public static function get(mixed $value, string $key): mixed
    {
        if ($value instanceof stdClass) {
            return property_exists($value, $key) ? $value->{$key} : Missing::Value;
        }
        return is_array($value) && array_key_exists($key, $value) ? $value[$key] : Missing::Value;
    }

    /** Read a value through bracket or dot path segments. */
    public static function path(mixed $value, string $path): mixed
    {
        foreach (self::segments($path) as $part) {
            $value = self::get($value, $part);
        }
        return $value;
    }

    /** Split a value path while retaining dots inside brackets. */
    public static function segments(string $path): array
    {
        $segments = [];
        $current = '';
        $bracket = false;
        for ($index = 0; $index < strlen($path); $index++) {
            $character = $path[$index];
            if ($character === '[' && !$bracket || $character === ']' && $bracket || $character === '.' && !$bracket) {
                if ($current !== '') {
                    $segments[] = $current;
                }
                $current = '';
                if ($character === '[') {
                    $bracket = true;
                } elseif ($character === ']') {
                    $bracket = false;
                }
            } else {
                $current .= $character;
            }
        }
        if ($current !== '') {
            $segments[] = $current;
        }
        return $segments;
    }

    /** Format a scalar value for a form control; objects and null are empty. */
    public static function scalar(mixed $value): string
    {
        if ($value === Missing::Value || $value === null || is_array($value) || is_object($value)) {
            return '';
        }
        return is_float($value) ? Numbers::string($value) : (string) $value;
    }

    /** Format values using expression string conversion rules. */
    public static function string(mixed $value): string
    {
        if ($value === Missing::Value) {
            return 'undefined';
        }
        if ($value === null) {
            return 'null';
        }
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        if (is_array($value)) {
            return implode(',', array_map(static fn ($v) => $v === null ? '' : self::string($v), $value));
        }
        if (is_object($value)) {
            return '[object Object]';
        }
        return is_float($value) ? Numbers::string($value) : (string) $value;
    }

    /** Evaluate condition truthiness while keeping empty collections true. */
    public static function truthy(mixed $value): bool
    {
        return $value !== Missing::Value && $value !== null && $value !== false && $value !== '' && $value !== 0 && $value !== 0.0;
    }

    /** Select the default only when the field value is absent. */
    public static function display(mixed $value, mixed $default): string
    {
        return self::scalar($value === Missing::Value && $default !== null && !is_array($default) ? $default : $value);
    }

    /** Convert a field path into a bracketed submission name. */
    public static function name(string $path, ?string $prefix = null): string
    {
        $parts = self::segments($path);
        if ($prefix) {
            array_unshift($parts, $prefix);
        }
        if (!$parts) {
            return $prefix ? $prefix . '[]' : '';
        }
        return array_shift($parts) . implode('', array_map(static fn ($p) => '[' . $p . ']', $parts));
    }

    /** Create a validation rule name with anonymous repeated segments. */
    public static function rule(string $path, array $rows): string
    {
        $suffix = str_ends_with($path, '[]') ? '[]' : '';
        $parts = self::segments($path);
        $out = $parts[0] ?? '';
        foreach (array_slice($parts, 1) as $i => $part) {
            $out .= in_array($i + 1, $rows, true) ? '[]' : '[' . $part . ']';
        }
        return $out . $suffix;
    }

    /** Return the final field name, including repeated-value notation. */
    public static function leaf(string $path, array $rows): string
    {
        $parts = self::segments($path);
        $last = end($parts);
        return in_array(count($parts) - 1, $rows, true) ? ($parts[count($parts) - 2] ?? '') . '[]' : $last;
    }

    /** Convert a field path to its structural element identifier. */
    public static function elementId(string $prefix, string $path): string
    {
        $clean = str_replace(['[]', '][', '[', ']'], ['', '-', '-', '-'], $path);
        $units = unpack('v*', mb_convert_encoding($clean, 'UTF-16LE', 'UTF-8'));
        $base = '';
        foreach ($units as $unit) {
            $base .= $unit < 128 && preg_match('/^[A-Za-z0-9_-]$/D', chr($unit)) ? chr($unit) : '-';
        }
        return $prefix !== '' ? $prefix . '-' . $base : $base;
    }

    /** Encode the instance prefix and complete field path as a control identifier. */
    public static function controlId(string $prefix, string $path): string
    {
        $encode = static fn ($v) => str_replace(['%21', '%27', '%28', '%29', '%2A'], ['!', "'", '(', ')', '*'], rawurlencode($v));
        return $encode($prefix) . ':' . $encode($path);
    }

    /** Join class strings with normalized whitespace. */
    public static function classes(string ...$parts): string
    {
        return trim(preg_replace('/\s+/', ' ', implode(' ', $parts)));
    }

    /** Normalize CSS declarations for the evaluated model. */
    public static function style(mixed $style): ?string
    {
        return Style::canonical($style);
    }

    /** Resolve translated text using the selected and default languages. */
    public static function translate(mixed $text, string $language, string $default = ''): string
    {
        if (is_string($text)) {
            return $text;
        }
        if (!$text instanceof stdClass && !is_array($text)) {
            return $default;
        }
        $map = (array) $text;
        foreach ([$language, 'en', 'ko', array_key_first($map)] as $key) {
            if ($key !== null && self::truthy($map[$key] ?? null)) {
                return self::scalar($map[$key]);
            }
        }
        return $default;
    }

    /** Build an object while omitting members marked as absent. */
    public static function record(array $members): stdClass
    {
        $out = new stdClass();
        foreach ($members as $key => $value) {
            if ($value !== Missing::Value) {
                $out->{(string) $key} = $value;
            }
        }
        return $out;
    }
}
