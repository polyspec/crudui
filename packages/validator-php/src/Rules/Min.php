<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Rules;

use CRUDUI\Validator\Values\Whitespace;

/**
 * Minimum value validation rule.
 */
class Min implements RuleInterface
{
    /**
     * Validate that a numeric value is at least the specified minimum.
     * The input value must be finite; the threshold ($param) may be Infinity.
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

        $minValue = (float)$param;
        return $numValue >= $minValue;
    }

    /**
     * Convert an input value to a finite number for comparison.
     * Validation semantics principle: input values must be finite real numbers,
     * so "Infinity"/"-Infinity"/"NaN" (and non-finite floats) return null (the
     * number rule reports them). Thresholds ($param) are handled separately and
     * still accept Infinity.
     */
    private function toNumber(mixed $value): ?float
    {
        if (is_int($value)) {
            return (float)$value;
        }
        if (is_float($value)) {
            return is_finite($value) ? $value : null;
        }
        if (\is_string($value)) {
            $value = Whitespace::trim($value);
        }
        if (is_numeric($value)) {
            $num = (float)$value;
            return is_finite($num) ? $num : null;
        }

        return null;
    }
}
