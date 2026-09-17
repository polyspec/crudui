<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Rules;

use CRUDUI\Validator\Values\Whitespace;

/**
 * Range validation rule.
 * Validates that a numeric value is within the specified range [min, max].
 */
class Range implements RuleInterface
{
    /**
     * Validate that a numeric value is within the specified range.
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        if (\is_string($value)) {
            $value = Whitespace::trim($value);
        }
        if (!is_numeric($value)) {
            return false;
        }

        if (!is_array($param) || count($param) !== 2) {
            return true;
        }

        [$min, $max] = $param;
        $minValue = is_numeric($min) ? (float)$min : 0;
        $maxValue = is_numeric($max) ? (float)$max : PHP_FLOAT_MAX;
        $numValue = (float)$value;

        return $numValue >= $minValue && $numValue <= $maxValue;
    }
}
