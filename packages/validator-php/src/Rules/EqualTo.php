<?php

declare(strict_types=1);

namespace Polyspec\Crudui\Validator\Rules;

use Polyspec\Crudui\Validator\Expr\FieldPath;

/**
 * Equal To validation rule.
 * Validates that a value matches another field's value.
 */
class EqualTo implements RuleInterface
{
    /**
     * Validate that a value matches another field's value.
     */
    public function validate(mixed $value, mixed $param, array $allData, FieldPath $path): bool
    {
        if ($param === null || $param === '') {
            return true;
        }

        $targetPath = (string)$param;
        $targetValue = $path->reference($targetPath, $allData);

        return $value === $targetValue;
    }
}
