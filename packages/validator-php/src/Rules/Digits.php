<?php

declare(strict_types=1);

namespace Polyspec\Crudui\Validator\Rules;

use Polyspec\Crudui\Validator\Expr\FieldPath;
use Polyspec\Crudui\Validator\Values\InvalidRuleParameter;
use Polyspec\Crudui\Validator\Values\Numeric;

/**
 * Digits: a string or number whose canonical text (a string trimmed) is ASCII digits passes.
 */
class Digits implements RuleInterface
{
    /**
     * @throws InvalidRuleParameter when the parameter is outside the validation rules
     */
    public function validate(mixed $value, mixed $param, array $allData, FieldPath $path): bool
    {
        return !Numeric::flag('digits', $param) || Numeric::isDigits($value);
    }
}
