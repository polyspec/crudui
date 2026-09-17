<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Rules;

use CRUDUI\Validator\Values\InvalidRuleParameter;
use CRUDUI\Validator\Values\Numeric;

/**
 * Inclusive numeric range: a numeric value within [minimum, maximum] passes; any other value fails.
 */
class Range implements RuleInterface
{
    /**
     * @throws InvalidRuleParameter when the parameter is outside the validation rules
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        [$minimum, $maximum] = Numeric::range($param);
        $number = Numeric::of($value);
        return $number !== null && $number >= $minimum && $number <= $maximum;
    }
}
