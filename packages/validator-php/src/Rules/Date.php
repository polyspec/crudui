<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Rules;

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

    /**
     * Returns the default error message for this rule.
     *
     * @return string Default message, with {0}, {1} placeholders where applicable
     */
    public function getDefaultMessage(): string
    {
        return 'Please enter a valid date.';
    }
}
