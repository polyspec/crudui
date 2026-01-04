<?php

declare(strict_types=1);

namespace FormSpec\Validator\Rules;

/**
 * Minimum length validation rule.
 */
class MinLength implements RuleInterface
{
    /**
     * Validate that a value has at least the specified length.
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        $minLength = (int)$param;

        if (is_array($value)) {
            return count($value) >= $minLength;
        }

        // Use mb_strlen for proper Unicode character counting
        $length = mb_strlen((string)$value, 'UTF-8');
        return $length >= $minLength;
    }

    public function getDefaultMessage(): string
    {
        return 'Please enter at least {0} characters.';
    }
}
