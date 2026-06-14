<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Rules;

/**
 * Maximum value validation rule.
 */
class Max implements RuleInterface
{
    /**
     * Validate that a numeric value does not exceed the specified maximum.
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

        $maxValue = (float)$param;
        return $numValue <= $maxValue;
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
        if (is_numeric($value)) {
            $num = (float)$value;
            return is_finite($num) ? $num : null;
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
