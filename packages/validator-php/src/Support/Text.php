<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Support;

use CRUDUI\Validator\Compose\ComposeLoadError;
use stdClass;

/**
 * Input text checks (docs/spec/input-text.md). Every string and object member name of a
 * specification, a composition file and caller data is valid UTF-8, the PHP form of a sequence
 * of Unicode scalar values. Invalid text is rejected before any other check of an operation; it
 * is never replaced and never passed on.
 */
final class Text
{
    /** Message of every input text failure. */
    public const MESSAGE = 'Text must be Unicode scalar values';

    /** Whether a string is valid UTF-8 without encoded surrogates. */
    public static function isScalar(string $text): bool
    {
        return preg_match('//u', $text) === 1;
    }

    /**
     * The path of the first invalid text: the path of a string, or of the object whose member
     * name is invalid. Members are visited in code point order of their names, which is the byte
     * order of UTF-8, and list items in index order. Null when every text is valid.
     *
     * @return list<string>|null
     */
    public static function invalidPath(mixed $value): ?array
    {
        return self::contains($value, 0, []) ? self::first($value, [], 0, []) : null;
    }

    /**
     * A standard object already on the current path, or a container nested deeper than any
     * accepted value, is not searched; the operation's value checks report it.
     *
     * @param array<int, true> $objects the identifiers of the objects on the current path
     */
    private static function enter(mixed $value, int $depth, array &$objects): bool
    {
        if ($depth > 512) {
            return false;
        }
        if ($value instanceof stdClass) {
            $id = spl_object_id($value);
            if (isset($objects[$id])) {
                return false;
            }
            $objects[$id] = true;
        }
        return true;
    }

    /** @param array<int, true> $objects */
    private static function contains(mixed $value, int $depth, array $objects): bool
    {
        if (is_string($value)) {
            return !self::isScalar($value);
        }
        if (!$value instanceof stdClass && !is_array($value)) {
            return false;
        }
        if (!self::enter($value, $depth, $objects)) {
            return false;
        }
        foreach ($value as $key => $child) {
            if (is_string($key) && !self::isScalar($key)) {
                return true;
            }
            if (self::contains($child, $depth + 1, $objects)) {
                return true;
            }
        }
        return false;
    }

    /**
     * @param list<string> $path
     * @param array<int, true> $objects
     * @return list<string>|null
     */
    private static function first(mixed $value, array $path, int $depth, array $objects): ?array
    {
        if (is_string($value)) {
            return self::isScalar($value) ? null : $path;
        }
        if (!$value instanceof stdClass && !is_array($value)) {
            return null;
        }
        if (!self::enter($value, $depth, $objects)) {
            return null;
        }
        if (is_array($value) && array_is_list($value)) {
            foreach ($value as $index => $child) {
                $found = self::first($child, [...$path, (string) $index], $depth + 1, $objects);
                if ($found !== null) {
                    return $found;
                }
            }
            return null;
        }
        $members = [];
        foreach ($value as $key => $child) {
            $name = (string) $key;
            if (!self::isScalar($name)) {
                return $path;
            }
            $members[] = [$name, $child];
        }
        usort($members, static fn (array $left, array $right): int => strcmp($left[0], $right[0]));
        foreach ($members as [$name, $child]) {
            $found = self::first($child, [...$path, $name], $depth + 1, $objects);
            if ($found !== null) {
                return $found;
            }
        }
        return null;
    }

    /**
     * Check a specification and then the composition files an operation reads. Invalid text is
     * the INVALID_TEXT load failure located at its specification path, or at the file name
     * followed by its path in the file; an invalid file name is located at the empty path.
     */
    public static function checkSpecification(mixed $spec, mixed $files): void
    {
        foreach ([$spec, $files] as $value) {
            $trace = self::invalidPath($value);
            if ($trace !== null) {
                throw new ComposeLoadError('INVALID_TEXT', self::MESSAGE, $trace);
            }
        }
    }

    /**
     * The failure message of the first invalid text among named caller values, which names the
     * value and its path, or null.
     *
     * @param list<array{0: string, 1: mixed}> $inputs
     */
    public static function inputFailure(array $inputs): ?string
    {
        foreach ($inputs as [$name, $value]) {
            $path = self::invalidPath($value);
            if ($path !== null) {
                return self::MESSAGE . ': ' . implode('.', [$name, ...$path]);
            }
        }
        return null;
    }

    /**
     * The present options named in $names, given in code point order, as named inputs.
     *
     * @param list<string> $names
     * @return list<array{0: string, 1: mixed}>
     */
    public static function options(array $options, array $names): array
    {
        $inputs = [];
        foreach ($names as $name) {
            if (array_key_exists($name, $options)) {
                $inputs[] = ['options.' . $name, $options[$name]];
            }
        }
        return $inputs;
    }
}
