<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Rules;

use CRUDUI\Validator\Values\EmptyValue;

/**
 * Required field validation rule: an empty value fails.
 */
class Required implements RuleInterface
{
    /**
     * Validate that a value is supplied and not empty.
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        if ($param === false) {
            return true;
        }
        return !EmptyValue::is($value);
    }
}
