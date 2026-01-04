<?php

declare(strict_types=1);

namespace FormSpec\Validator\Rules;

/**
 * Date validation rule.
 * Validates that a value is a valid date.
 */
class Date implements RuleInterface
{
    /**
     * Validate that a value is a valid date.
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        if ($param === false) {
            return true;
        }

        if ($value instanceof \DateTimeInterface) {
            return true;
        }

        if (!is_string($value) && !is_numeric($value)) {
            return false;
        }

        $stringValue = trim((string)$value);
        if ($stringValue === '') {
            return false;
        }

        // Try to parse the date
        try {
            $date = new \DateTime($stringValue);
            return $date !== false;
        } catch (\Exception $e) {
            return false;
        }
    }

    public function getDefaultMessage(): string
    {
        return 'Please enter a valid date.';
    }
}
