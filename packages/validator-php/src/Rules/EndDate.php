<?php

declare(strict_types=1);

namespace FormSpec\Validator\Rules;

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
        $startDateValue = $this->getValueByPath($allData, $startDatePath, $path);

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
     * Get value from form data by path.
     */
    private function getValueByPath(array $data, string $targetPath, string $currentPath): mixed
    {
        if (str_starts_with($targetPath, '.')) {
            $currentParts = explode('.', $currentPath);
            array_pop($currentParts);

            $relativeParts = explode('.', $targetPath);

            foreach ($relativeParts as $part) {
                if ($part === '') {
                    if (!empty($currentParts)) {
                        array_pop($currentParts);
                    }
                } else {
                    $currentParts[] = $part;
                }
            }

            $targetPath = implode('.', $currentParts);
        }

        $segments = explode('.', $targetPath);
        $current = $data;

        foreach ($segments as $segment) {
            if ($segment === '') {
                continue;
            }
            if (!is_array($current) || !array_key_exists($segment, $current)) {
                return null;
            }
            $current = $current[$segment];
        }

        return $current;
    }

    public function getDefaultMessage(): string
    {
        return 'End date must be after the start date.';
    }
}
