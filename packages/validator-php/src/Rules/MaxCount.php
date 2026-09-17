<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Rules;

use CRUDUI\Validator\Values\InvalidRuleParameter;
use CRUDUI\Validator\Values\LengthLimit;
use CRUDUI\Validator\Values\Numeric;

/**
 * Maximum collection size: array elements, object keys, 0 for a missing or blank value, 1 for another scalar.
 */
class MaxCount implements RuleInterface
{
    /**
     * @throws InvalidRuleParameter when the parameter is outside the validation rules
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        return Numeric::count($value) <= LengthLimit::single('maxcount', $param);
    }
}
