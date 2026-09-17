<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Rules;

use CRUDUI\Validator\Values\InvalidRuleParameter;
use CRUDUI\Validator\Values\Numeric;

/**
 * Step: a numeric value that is an exact integer multiple of the step, counted from 0, passes; any other value fails.
 */
class Step implements RuleInterface
{
    /**
     * @throws InvalidRuleParameter when the parameter is outside the validation rules
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        $step = Numeric::step($param);
        $number = Numeric::of($value);
        return $number !== null && Numeric::isMultiple($number, $step);
    }
}
