<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Rules;

/**
 * Number validation rule.
 * Validates that a value is a valid number (integer or decimal).
 */
class Number implements RuleInterface
{
    /**
     * Validate that a value is a valid number.
     * Validation semantics principle: an input value must be a finite real
     * number. "Infinity"/"-Infinity"/"NaN" are rejected. This is the input value
     * gate only — min/max threshold parameters keep accepting Infinity.
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        if ($param === false) {
            return true;
        }

        // A non-finite float (INF/-INF/NAN) is not a valid input value.
        if (is_float($value)) {
            return is_finite($value);
        }

        // is_numeric covers ints and numeric strings. "Infinity"/"-Infinity"/
        // "NaN" are not numeric strings in PHP, so they are rejected here.
        return is_numeric($value);
    }

    /**
     * Returns the default error message for this rule.
     *
     * @return string Default message, with {0}, {1} placeholders where applicable
     */
    public function getDefaultMessage(): string
    {
        return 'Please enter a valid number.';
    }
}
