<?php

declare(strict_types=1);

namespace FormSpec\Validator\Rules;

/**
 * Maximum value validation rule.
 */
class Max implements RuleInterface
{
    /**
     * Validate that a numeric value does not exceed the specified maximum.
     * Handles Infinity/-Infinity strings.
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        // A non-numeric threshold is a malformed rule param; skip it (valid)
        // rather than coercing to 0, matching JS (isNaN) and Go (ParseFloat err).
        if (!is_numeric($param)) {
            return true;
        }

        $numValue = $this->toNumber($value);
        if ($numValue === null) {
            return false;
        }

        $maxValue = (float)$param;
        return $numValue <= $maxValue;
    }

    /**
     * Convert value to number, handling Infinity.
     */
    private function toNumber(mixed $value): ?float
    {
        if (is_numeric($value)) {
            return (float)$value;
        }

        if (is_string($value)) {
            $trimmed = trim($value);
            if ($trimmed === 'Infinity') {
                return INF;
            }
            if ($trimmed === '-Infinity') {
                return -INF;
            }
        }

        return null;
    }

    /**
     * Returns the default error message for this rule.
     *
     * @return string Default message, with {0}, {1} placeholders where applicable
     */
    public function getDefaultMessage(): string
    {
        return 'Please enter a value less than or equal to {0}.';
    }
}
