<?php

declare(strict_types=1);

namespace Polyspec\Validator\Rules;

/**
 * Range length validation rule.
 * Validates that a string length is within the specified range [min, max].
 */
class RangeLength implements RuleInterface
{
    /**
     * Validate that a string length is within the specified range.
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        if (!is_array($param) || count($param) !== 2) {
            return true;
        }

        [$min, $max] = $param;
        $minLength = is_numeric($min) ? (int)$min : 0;
        $maxLength = is_numeric($max) ? (int)$max : PHP_INT_MAX;

        $length = mb_strlen((string)$value, 'UTF-8');

        return $length >= $minLength && $length <= $maxLength;
    }

    /**
     * Returns the default error message for this rule.
     *
     * @return string Default message, with {0}, {1} placeholders where applicable
     */
    public function getDefaultMessage(): string
    {
        return 'Please enter a value between {0} and {1} characters.';
    }
}
