<?php

declare(strict_types=1);

namespace FormSpec\Validator\Rules;

/**
 * Min Count validation rule.
 * Validates that an array has at least the specified number of items.
 */
class MinCount implements RuleInterface
{
    /**
     * Validate that an array has at least the minimum number of items.
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        if (!is_numeric($param)) {
            return true;
        }

        $minCount = (int)$param;

        if (is_array($value)) {
            return count($value) >= $minCount;
        }

        // Handle countable objects
        if ($value instanceof \Countable) {
            return count($value) >= $minCount;
        }

        return false;
    }

    public function getDefaultMessage(): string
    {
        return 'Please select at least {0} items.';
    }
}
