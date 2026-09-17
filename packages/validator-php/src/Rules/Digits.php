<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Rules;

use CRUDUI\Validator\Values\Whitespace;

/**
 * Digits validation rule.
 * Validates that a value contains only digits (integer only, no decimals).
 */
class Digits implements RuleInterface
{
    /**
     * Validate that a value contains only digits.
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        if ($param === false) {
            return true;
        }

        $stringValue = \is_string($value) ? Whitespace::trim($value) : (string)$value;

        // Only allow positive integers (no sign, no decimal)
        return preg_match('/^[0-9]+$/D', $stringValue) === 1;
    }
}
