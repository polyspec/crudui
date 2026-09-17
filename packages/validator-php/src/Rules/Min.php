<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Rules;

use CRUDUI\Validator\Values\InvalidRuleParameter;
use CRUDUI\Validator\Values\Numeric;

/**
 * Inclusive lower bound: a numeric value not below the bound passes; any other value fails.
 */
class Min implements RuleInterface
{
    /**
     * @throws InvalidRuleParameter when the parameter is outside the validation rules
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        $bound = Numeric::bound('min', $param);
        $number = Numeric::of($value);
        return $number !== null && $number >= $bound;
    }
}
