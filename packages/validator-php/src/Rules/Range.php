<?php

declare(strict_types=1);

namespace Polyspec\Crudui\Validator\Rules;

use Polyspec\Crudui\Validator\Expr\FieldPath;
use Polyspec\Crudui\Validator\Values\InvalidRuleParameter;
use Polyspec\Crudui\Validator\Values\Numeric;

/**
 * Inclusive numeric range: a numeric value within [minimum, maximum] passes; any other value fails.
 */
class Range implements RuleInterface
{
    /**
     * @throws InvalidRuleParameter when the parameter is outside the validation rules
     */
    public function validate(mixed $value, mixed $param, array $allData, FieldPath $path): bool
    {
        [$minimum, $maximum] = Numeric::range($param);
        $number = Numeric::of($value);
        return $number !== null && $number >= $minimum && $number <= $maximum;
    }
}
