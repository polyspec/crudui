<?php

declare(strict_types=1);

namespace CRUDUI\Generator;

use CRUDUI\FormError;
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

    /** The members a choice of a choice or multichoice field may declare besides value and label. */
    private const APPEARANCE_MEMBERS = ['class', 'style', 'attributes'];

    /**
     * The value text and label pairs in list order, or null when an element has another member
     * (an appearance member is accepted with $appearance), lacks value or label, has a value that
     * is not a string or a finite number, or repeats the canonical text of an earlier value.
     *
     * @param list<mixed> $items
     * @return list<array{0: string, 1: mixed}>|null
     */
    public static function pairs(array $items, bool $appearance = false): ?array
    {
        $pairs = [];
        $seen = [];
        foreach ($items as $item) {
            if (!$item instanceof stdClass || !property_exists($item, 'value') || !property_exists($item, 'label')) {
                return null;
            }
            foreach (array_keys(get_object_vars($item)) as $member) {
                if ($member !== 'value' && $member !== 'label' && !($appearance && in_array($member, self::APPEARANCE_MEMBERS, true))) {
                    return null;
                }
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

    /**
     * Reject the appearance of a valid choice list whose class or style is not a string or whose
     * attributes break the declared attribute rules, choice by choice in list order.
     *
     * @param list<stdClass> $items
     */
    public static function checkAppearance(array $items, string $path): void
    {
        foreach ($items as $index => $choice) {
            foreach (['class', 'style'] as $member) {
                if (property_exists($choice, $member) && !is_string($choice->{$member})) {
                    throw new FormError('INVALID_FORM_INPUT', sprintf('Invalid items.%d.%s at %s: expected a string', $index, $member, $path));
                }
            }
            if (property_exists($choice, 'attributes')) {
                Template::checkDeclaredAttributes($choice->attributes, 'items.' . $index . '.attributes', $path);
            }
        }
    }

    /**
     * The appearance of each choice of a checked choice list in list order: className, style
     * (normalized as a design style) and attributes, each only when declared.
     *
     * @param list<stdClass> $items
     * @return list<array<string, mixed>>
     */
    public static function appearances(array $items): array
    {
        return array_map(static function (stdClass $choice): array {
            $out = [];
            if (is_string($choice->class ?? null) && $choice->class !== '') {
                $out['className'] = $choice->class;
            }
            $style = Value::style($choice->style ?? null);
            if ($style !== null && $style !== '') {
                $out['style'] = $style;
            }
            if (($choice->attributes ?? null) instanceof stdClass && get_object_vars($choice->attributes) !== []) {
                $out['attributes'] = clone $choice->attributes;
            }
            return $out;
        }, $items);
    }
}
