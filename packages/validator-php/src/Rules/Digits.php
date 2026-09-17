<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Rules;

use CRUDUI\Validator\Values\InvalidRuleParameter;
use CRUDUI\Validator\Values\Numeric;

/**
 * Digits: a string or number whose canonical text (a string trimmed) is ASCII digits passes.
 */
class Digits implements RuleInterface
{
    /**
     * @throws InvalidRuleParameter when the parameter is outside the validation rules
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        return !Numeric::flag('digits', $param) || Numeric::isDigits($value);
    }
}
