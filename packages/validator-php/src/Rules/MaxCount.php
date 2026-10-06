<?php

declare(strict_types=1);

namespace Polyspec\Crudui\Validator\Rules;

use Polyspec\Crudui\Validator\Expr\FieldPath;
use Polyspec\Crudui\Validator\Values\InvalidRuleParameter;
use Polyspec\Crudui\Validator\Values\LengthLimit;
use Polyspec\Crudui\Validator\Values\Numeric;

/**
 * Maximum collection size: array elements, object keys, 0 for a missing or blank value, 1 for another scalar.
 */
class MaxCount implements RuleInterface
{
    /**
     * @throws InvalidRuleParameter when the parameter is outside the validation rules
     */
    public function validate(mixed $value, mixed $param, array $allData, FieldPath $path): bool
    {
        return Numeric::count($value) <= LengthLimit::single('maxcount', $param);
    }
}
