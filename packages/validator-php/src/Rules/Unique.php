<?php

declare(strict_types=1);

namespace FormSpec\Validator\Rules;

use FormSpec\Validator\PathResolver;

/**
 * Unique values validation rule.
 * Ensures all values in an array field are unique.
 */
class Unique implements RuleInterface
{
    private PathResolver $pathResolver;

    public function __construct()
    {
        $this->pathResolver = new PathResolver();
    }

    /**
     * Validate that all values in the array are unique.
     *
     * This can be called in two ways:
     * 1. With value being the entire array (new behavior for array-level validation)
     * 2. With value being a single item (legacy behavior for item-level validation)
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        if ($param === false) {
            return true;
        }

        // Check if value is the array itself (array-level validation)
        if (is_array($value) && array_is_list($value)) {
            return $this->validateArray($value, $param);
        }

        // Legacy: value is a single item, get the parent array
        $pathParts = explode('.', $path);
        array_pop($pathParts); // Remove current index

        // Get the parent array
        $parentPath = implode('.', $pathParts);
        $parentArray = $this->pathResolver->getValueByPath($parentPath, $allData);

        if (!is_array($parentArray)) {
            return true;
        }

        return $this->validateArray($parentArray, $param);
    }

    /**
     * Validate uniqueness in an array.
     */
    private function validateArray(array $array, mixed $param): bool
    {
        // Collect all values
        $values = [];
        foreach ($array as $item) {
            if (is_array($item)) {
                // If param is a string, it's a field name to check uniqueness for
                if (is_string($param) && $param !== '') {
                    $itemValue = $item[$param] ?? null;
                } else {
                    // Check the whole item or use the value itself
                    $itemValue = $item;
                }
            } else {
                $itemValue = $item;
            }

            // Skip empty values
            if ($itemValue === null || $itemValue === '') {
                continue;
            }

            // Handle file arrays
            if (is_array($itemValue) && isset($itemValue['name']) && isset($itemValue['tmp_name'])) {
                $itemValue = $itemValue['name'];
            }

            // Convert to string for comparison
            $compareValue = is_scalar($itemValue) ? (string)$itemValue : json_encode($itemValue);

            if (in_array($compareValue, $values, true)) {
                return false;
            }

            $values[] = $compareValue;
        }

        return true;
    }

    public function getDefaultMessage(): string
    {
        return 'Values must be unique.';
    }
}
