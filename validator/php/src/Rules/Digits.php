<?php

declare(strict_types=1);

namespace FormSpec\Validator\Rules;

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

    public function getDefaultMessage(): string
    {
        return 'Please enter only digits.';
    }
}
