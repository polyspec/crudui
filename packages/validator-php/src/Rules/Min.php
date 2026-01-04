<?php

declare(strict_types=1);

namespace FormSpec\Validator\Rules;

/**
 * Minimum value validation rule.
 */
class Min implements RuleInterface
{
    /**
     * Validate that a numeric value is at least the specified minimum.
     * Handles Infinity/-Infinity strings.
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        $numValue = $this->toNumber($value);
        if ($numValue === null) {
            return false;
        }

        $minValue = is_numeric($param) ? (float)$param : 0;
        return $numValue >= $minValue;
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

    public function getDefaultMessage(): string
    {
        return 'Please enter a value greater than or equal to {0}.';
    }
}
