<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Rules;

/**
 * Email format validation rule.
 */
class Email implements RuleInterface
{
    /**
     * Validate that a value is a valid email address.
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        if ($param === false) {
            return true;
        }

        if (!is_string($value)) {
            return false;
        }

        return filter_var($value, FILTER_VALIDATE_EMAIL) !== false;
    }
}
