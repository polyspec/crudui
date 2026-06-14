<?php

declare(strict_types=1);

namespace Polyspec\Validator\Rules;

/**
 * Max Count validation rule.
 * Validates that an array has at most the specified number of items.
 */
class MaxCount implements RuleInterface
{
    /**
     * Validate that an array has at most the maximum number of items.
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        if (!is_numeric($param)) {
            return true;
        }

        $maxCount = (int)$param;

        if (is_array($value)) {
            return count($value) <= $maxCount;
        }

        // Handle countable objects
        if ($value instanceof \Countable) {
            return count($value) <= $maxCount;
        }

        // Non-array values have count of 1
        return 1 <= $maxCount;
    }

    /**
     * Returns the default error message for this rule.
     *
     * @return string Default message, with {0}, {1} placeholders where applicable
     */
    public function getDefaultMessage(): string
    {
        return 'Please select no more than {0} items.';
    }
}
