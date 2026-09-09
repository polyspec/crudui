<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Rules;

use CRUDUI\Validator\PathResolver;

/**
 * End Date validation rule.
 * Validates that an end date is greater than or equal to a start date field.
 */
class EndDate implements RuleInterface
{
    /**
     * Validate that an end date is after or equal to the start date.
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        if ($param === null || $param === '') {
            return true;
        }

        // Parse the end date (current field value)
        $endDate = $this->parseDate($value);
        if ($endDate === null) {
            return true; // Invalid date format, let date rule handle it
        }

        // Get the start date field path
        $startDatePath = (string)$param;
        $startDateValue = (new PathResolver())->resolveExpression($startDatePath, $path, $allData);

        // Skip if start date is empty
        if ($startDateValue === null || $startDateValue === '') {
            return true;
        }

        // Parse the start date
        $startDate = $this->parseDate($startDateValue);
        if ($startDate === null) {
            return true; // Invalid start date, skip validation
        }

        // Compare dates
        return $endDate >= $startDate;
    }

    /**
     * Parse a date value to timestamp.
     */
    private function parseDate(mixed $value): ?int
    {
        if ($value instanceof \DateTimeInterface) {
            return $value->getTimestamp();
        }

        if (!is_string($value) && !is_numeric($value)) {
            return null;
        }

        $stringValue = trim((string)$value);
        if ($stringValue === '') {
            return null;
        }

        $timestamp = strtotime($stringValue);
        return $timestamp === false ? null : $timestamp;
    }

    /**
     * Returns the default error message for this rule.
     *
     * @return string Default message, with {0}, {1} placeholders where applicable
     */
    public function getDefaultMessage(): string
    {
        return 'End date must be after the start date.';
    }
}
