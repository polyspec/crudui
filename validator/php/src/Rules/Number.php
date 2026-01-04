<?php

declare(strict_types=1);

namespace FormSpec\Validator\Rules;

/**
 * Number validation rule.
 * Validates that a value is a valid number (integer or decimal).
 */
class Number implements RuleInterface
{
    /**
     * Validate that a value is a valid number.
     * Accepts Infinity/-Infinity as valid numbers for proper min/max validation.
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        if ($param === false) {
            return true;
        }

        // Already a number
        if (is_numeric($value)) {
            return true;
        }

        // Handle string Infinity/-Infinity (like JS)
        if (is_string($value)) {
            $trimmed = trim($value);
            if ($trimmed === 'Infinity' || $trimmed === '-Infinity') {
                return true;
            }
        }

        return false;
    }

    public function getDefaultMessage(): string
    {
        return 'Please enter a valid number.';
    }
}
