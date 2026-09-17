<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Rules;

use CRUDUI\Validator\Values\InvalidRuleParameter;
use CRUDUI\Validator\Values\Numeric;

/**
 * Inclusive upper bound: a numeric value not above the bound passes; any other value fails.
 */
class Max implements RuleInterface
{
    /**
     * @throws InvalidRuleParameter when the parameter is outside the validation rules
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        $bound = Numeric::bound('max', $param);
        $number = Numeric::of($value);
        return $number !== null && $number <= $bound;
    }
}
