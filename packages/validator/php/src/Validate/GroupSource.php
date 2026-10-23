<?php

declare(strict_types=1);

namespace Polyspec\Crudui\Validator\Validate;

use Polyspec\Crudui\Validator\Values\CanonicalText;
use Polyspec\Crudui\Validator\Values\Whitespace;

/**
 * Choices from a repeated group (docs/spec/schema.md, "Choices from a repeated group"): a choice
 * field whose `items` is a group source `{ from, label? }` takes its choices from the rows of a
 * repeated group of the same form. This class checks the declaration and reads the choices from
 * the data; the generator lists them and the validator checks a value against them
 * (docs/spec/validation-rules.md, "Values").
 *
 * @internal
 */
final class GroupSource
{
    /** The field types that take a group source. */
    private const CHOICE_TYPES = [
        'select', 'dropdown', 'selectbox', 'choice', 'radio', 'multichoice', 'checkboxes', 'checkcontainer',
    ];

    /** Whether `items` is a group source: an object with the member `from`. */
    public static function isSource(mixed $items): bool
    {
        return self::isObject($items) && array_key_exists('from', (array) $items);
    }

    /**
     * The message of the first rule that the group source of a field breaks under the root
     * properties, or null: the members of `items` in declaration order, the field, `from` and then
     * `label`.
     *
     * @param array<array-key, mixed> $field the composed field declaration
     * @param array<array-key, mixed> $root the composed root properties
     */
    public static function failure(array $field, string $path, array $root): ?string
    {
        $items = $field['items'] ?? null;
        if (!self::isSource($items)) {
            return null;
        }
        $source = (array) $items;
        foreach (array_keys($source) as $key) {
            if ($key !== 'from' && $key !== 'label') {
                return sprintf('Invalid items.%s at %s: unknown key', $key, $path);
            }
        }
        if (!in_array($field['type'] ?? null, self::CHOICE_TYPES, true) || self::hasLang($field)) {
            return sprintf('Invalid items.from at %s: expected a choice field without lang', $path);
        }
        $group = self::sourceGroup($source['from'], $root);
        if ($group === null) {
            return sprintf(
                'Invalid items.from at %s: expected {group}.*.{field} for a field of a repeated group '
                . 'outside repeated groups',
                $path
            );
        }
        if (array_key_exists('label', $source) && !self::scalarChild($group, $source['label'])) {
            return sprintf(
                'Invalid items.label at %s: expected the name of a direct child field of the group '
                . 'without multiple, properties or lang',
                $path
            );
        }
        return null;
    }

    /**
     * The choices of a checked group source for the root data, as [value text, label text] pairs:
     * one per row of the group in data order whose value is a string or a finite number with a
     * non-empty canonical text, each value once, labelled with the text of its `label` field or
     * else its value.
     *
     * @param array<array-key, mixed> $source the group source `{ from, label? }`
     * @return list<array{0: string, 1: string}>
     */
    public static function choices(array $source, mixed $data): array
    {
        $segments = explode('.', (string) $source['from']);
        $valueName = (string) end($segments);
        $label = $source['label'] ?? null;
        $rows = $data;
        foreach (array_slice($segments, 0, -2) as $name) {
            if (!self::isObject($rows) || !array_key_exists($name, (array) $rows)) {
                return [];
            }
            $rows = ((array) $rows)[$name];
        }
        if (!self::isObject($rows)) {
            return [];
        }
        $choices = [];
        $seen = [];
        foreach ((array) $rows as $row) {
            if (!self::isObject($row)) {
                continue;
            }
            $row = (array) $row;
            $value = self::choiceText($row[$valueName] ?? null);
            if ($value === null || isset($seen[$value])) {
                continue;
            }
            $seen[$value] = true;
            $text = is_string($label) ? self::choiceText($row[$label] ?? null) : null;
            $choices[] = [$value, $text ?? $value];
        }
        return $choices;
    }

    /**
     * The child fields of the repeated group that `from` names under the root properties, or null
     * when `from` is not `{group}.*.{field}` for a field of a repeated group outside repeated groups.
     *
     * @param array<array-key, mixed> $root
     * @return array<array-key, mixed>|null
     */
    private static function sourceGroup(mixed $from, array $root): ?array
    {
        if (!is_string($from)) {
            return null;
        }
        $segments = explode('.', $from);
        $count = count($segments);
        if ($count < 3 || $segments[$count - 2] !== '*') {
            return null;
        }
        $properties = $root;
        foreach (array_slice($segments, 0, -2) as $index => $name) {
            if ($name === '' || !array_key_exists($name, $properties) || !self::isObject($properties[$name])) {
                return null;
            }
            $field = (array) $properties[$name];
            if (
                ($field['type'] ?? null) !== 'group'
                || !self::isObject($field['properties'] ?? null)
                || self::repeated($field) !== ($index === $count - 3)
            ) {
                return null;
            }
            $properties = (array) $field['properties'];
        }
        return self::scalarChild($properties, $segments[$count - 1]) ? $properties : null;
    }

    /** Whether a direct child `name` of a group is a scalar child: not a group, not repeated and without lang. */
    private static function scalarChild(array $properties, mixed $name): bool
    {
        if (!is_string($name) || !array_key_exists($name, $properties) || !self::isObject($properties[$name])) {
            return false;
        }
        $child = (array) $properties[$name];
        return ($child['type'] ?? null) !== 'group'
            && !array_key_exists('properties', $child)
            && !self::repeated($child)
            && !self::hasLang($child);
    }

    /** Whether a field repeats: multiple is true, only or an object. */
    private static function repeated(array $field): bool
    {
        $multiple = $field['multiple'] ?? null;
        return $multiple === true || $multiple === 'only' || self::isObject($multiple);
    }

    /** Whether a field declares lang: true or an object. */
    private static function hasLang(array $field): bool
    {
        $lang = $field['lang'] ?? null;
        return $lang === true || self::isObject($lang);
    }

    /** The canonical text of a string or a finite number that is not empty after trimming, or null. */
    private static function choiceText(mixed $value): ?string
    {
        if (!is_string($value) && !is_int($value) && !(is_float($value) && is_finite($value))) {
            return null;
        }
        $text = CanonicalText::of($value);
        return $text !== null && Whitespace::trim($text) !== '' ? $text : null;
    }

    /** A JSON object value: stdClass or a non-empty associative array. */
    private static function isObject(mixed $value): bool
    {
        return $value instanceof \stdClass || (is_array($value) && $value !== [] && !array_is_list($value));
    }
}
