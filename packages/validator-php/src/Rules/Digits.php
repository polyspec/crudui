<?php

declare(strict_types=1);

namespace Polyspec\Validator\Rules;

/**
 * Digits validation rule.
 * Validates that a value contains only digits (integer only, no decimals).
 */
class Digits implements RuleInterface
{
    /**
     * Validate that a value contains only digits.
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        if ($param === false) {
            return true;
        }

        $stringValue = (string)$value;

        // Only allow positive integers (no sign, no decimal)
        return preg_match('/^\d+$/', $stringValue) === 1;
    }

    /**
     * Returns the default error message for this rule.
     *
     * @return string Default message, with {0}, {1} placeholders where applicable
     */
    public function getDefaultMessage(): string
    {
        return 'Please enter only digits.';
    }
}
