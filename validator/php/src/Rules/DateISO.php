<?php

declare(strict_types=1);

namespace FormSpec\Validator\Rules;

/**
 * ISO Date validation rule.
 * Validates that a value is a valid ISO 8601 date format (YYYY-MM-DD).
 */
class DateISO implements RuleInterface
{
    /**
     * Validate that a value is a valid ISO date.
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        if ($param === false) {
            return true;
        }

        if (!is_string($value)) {
            return false;
        }

        $stringValue = trim($value);

        // Check format YYYY-MM-DD
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $stringValue)) {
            return false;
        }

        // Validate the date components
        [$year, $month, $day] = explode('-', $stringValue);

        return checkdate((int)$month, (int)$day, (int)$year);
    }

    public function getDefaultMessage(): string
    {
        return 'Please enter a valid date in ISO format (YYYY-MM-DD).';
    }
}
