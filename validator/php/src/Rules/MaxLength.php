<?php

declare(strict_types=1);

namespace FormSpec\Validator\Rules;

/**
 * Maximum length validation rule.
 */
class MaxLength implements RuleInterface
{
    /**
     * Validate that a value does not exceed the specified length.
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        $maxLength = (int)$param;

        if (is_array($value)) {
            return count($value) <= $maxLength;
        }

        // Use mb_strlen for proper Unicode character counting
        $length = mb_strlen((string)$value, 'UTF-8');
        return $length <= $maxLength;
    }

    public function getDefaultMessage(): string
    {
        return 'Please enter no more than {0} characters.';
    }
}
