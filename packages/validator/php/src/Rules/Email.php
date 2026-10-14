<?php

declare(strict_types=1);

namespace Polyspec\Crudui\Validator\Rules;

use Polyspec\Crudui\Validator\Expr\FieldPath;

/**
 * Email format validation rule.
 */
class Email implements RuleInterface
{
    /**
     * Validate that a value is a valid email address.
     */
    public function validate(mixed $value, mixed $param, array $allData, FieldPath $path): bool
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
