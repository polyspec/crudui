<?php

declare(strict_types=1);

namespace Polyspec\Crudui\Validator\Rules;

use Polyspec\Crudui\Validator\Expr\FieldPath;
use Polyspec\Crudui\Validator\Values\InvalidRuleParameter;
use Polyspec\Crudui\Validator\Values\Numeric;

/**
 * Inclusive upper bound: a numeric value not above the bound passes; any other value fails.
 */
class Max implements RuleInterface
{
    /**
     * @throws InvalidRuleParameter when the parameter is outside the validation rules
     */
    public function validate(mixed $value, mixed $param, array $allData, FieldPath $path): bool
    {
        $bound = Numeric::bound('max', $param);
        $number = Numeric::of($value);
        return $number !== null && $number <= $bound;
    }
}
