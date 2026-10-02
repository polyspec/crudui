<?php

declare(strict_types=1);

namespace CRUDUI\Generator;

use stdClass;

/** Read choice lists: `items` arrays of value and label pairs kept in list order. */
final class ChoiceList
{
    /** The expected-value text of a choice list declaration failure. */
    public const EXPECTED = 'value and label pairs with distinct string or number values';

    /** Whether `items` is a choice list: an array with an object element that has a `value` member. */
    public static function is(mixed $items): bool
    {
        if (!is_array($items)) {
            return false;
        }
        foreach ($items as $item) {
            if ($item instanceof stdClass && property_exists($item, 'value')) {
                return true;
            }
        }
        return false;
    }

    /**
     * The value text and label pairs in list order, or null when an element has another member,
     * lacks value or label, has a value that is not a string or a finite number, or repeats the
     * canonical text of an earlier value.
     *
     * @param list<mixed> $items
     * @return list<array{0: string, 1: mixed}>|null
     */
    public static function pairs(array $items): ?array
    {
        $pairs = [];
        $seen = [];
        foreach ($items as $item) {
            if (!$item instanceof stdClass || count(get_object_vars($item)) !== 2 || !property_exists($item, 'value') || !property_exists($item, 'label')) {
                return null;
            }
            $value = $item->value;
            if (!is_string($value) && !is_int($value) && !(is_float($value) && is_finite($value))) {
                return null;
            }
            $text = Value::scalar($value);
            if (isset($seen[$text])) {
                return null;
            }
            $seen[$text] = true;
            $pairs[] = [$text, $item->label];
        }
        return $pairs;
    }
}
