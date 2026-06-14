<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Rules;

use CRUDUI\Validator\PathResolver;

/**
 * Unique values validation rule.
 *
 * Two modes (canonical per tests/cases/unique.json):
 * 1. Array-level: value is the whole array of a multiple field - every
 *    non-empty entry must be unique (type-strict comparison).
 * 2. Field-level: value is a scalar field inside a repeated group
 *    (e.g. items.1.code) - the value must not repeat the same field of
 *    any EARLIER sibling, so the error is reported on the later duplicate.
 */
class Unique implements RuleInterface
{
    private readonly PathResolver $pathResolver;

    /**
     * Constructs the rule with a fresh path resolver for sibling lookups.
     */
    public function __construct()
    {
        $this->pathResolver = new PathResolver();
    }

    /**
     * Validates uniqueness in array-level or field-level mode.
     *
     * @param mixed  $value   the array (array-level) or scalar (field-level) to check
     * @param mixed  $param   field name for object entries, or false to skip
     * @param array  $allData all form data (for sibling comparison)
     * @param string $path    current field path (dot notation)
     * @return bool true when unique
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        if ($param === false) {
            return true;
        }

        // Array-level validation: the multiple field's array as a whole
        if (is_array($value) && array_is_list($value)) {
            return $this->validateArray($value, $param);
        }

        // Field-level validation: scalar inside a repeated group
        return $this->validateAgainstEarlierSiblings($value, $allData, $path);
    }

    /**
     * Validate uniqueness within a single array (multiple field).
     */
    private function validateArray(array $array, mixed $param): bool
    {
        $seen = [];

        foreach ($array as $item) {
            // If param is a field name, compare that field of each object entry
            if (is_array($item) && is_string($param) && $param !== '') {
                $item = $item[$param] ?? null;
            }

            $item = $this->normalizeValue($item);

            // Skip empty values
            if ($item === null || $item === '') {
                continue;
            }

            // Type-strict comparison: "1" (string) and 1 (int) are distinct
            if (in_array($item, $seen, true)) {
                return false;
            }

            $seen[] = $item;
        }

        return true;
    }

    /**
     * Validate a scalar field of a repeated group against earlier siblings.
     * E.g. for path "orders.0.items.1.product_code" the comparison set is
     * "orders.0.items.<i>.product_code" for all i < 1.
     */
    private function validateAgainstEarlierSiblings(mixed $value, array $allData, string $path): bool
    {
        $current = $this->normalizeValue($value);
        if ($current === null || $current === '') {
            return true;
        }

        $parts = explode('.', $path);
        $fieldName = array_pop($parts);
        if ($fieldName === null || count($parts) === 0) {
            return true;
        }

        // The field must live inside an indexed array item
        $indexPart = array_pop($parts);
        if ($indexPart === null || !is_numeric($indexPart)) {
            return true;
        }
        $index = (int)$indexPart;

        $parentArray = $this->pathResolver->getValueByPath(implode('.', $parts), $allData);
        if (!is_array($parentArray)) {
            return true;
        }

        foreach ($parentArray as $siblingIndex => $sibling) {
            if (!is_numeric((string)$siblingIndex) || (int)$siblingIndex >= $index) {
                continue;
            }
            if (!is_array($sibling)) {
                continue;
            }

            $siblingValue = $this->normalizeValue($sibling[$fieldName] ?? null);
            if ($siblingValue === null || $siblingValue === '') {
                continue;
            }

            if ($siblingValue === $current) {
                return false;
            }
        }

        return true;
    }

    /**
     * Normalize a value for comparison (file uploads compare by name).
     */
    private function normalizeValue(mixed $value): mixed
    {
        if (is_array($value) && isset($value['name'], $value['tmp_name'])) {
            return $value['name'];
        }
        return $value;
    }

    /**
     * Returns the default error message for this rule.
     *
     * @return string Default message, with {0}, {1} placeholders where applicable
     */
    public function getDefaultMessage(): string
    {
        return 'Values must be unique.';
    }
}
