<?php

declare(strict_types=1);

namespace Polyspec\Crudui\Validator\Rules;

use Polyspec\Crudui\Validator\Expr\FieldPath;
use Polyspec\Crudui\Validator\Values\InvalidRuleParameter;
use Polyspec\Crudui\Validator\Values\LengthLimit;

/**
 * Range length validation rule on the code points of the canonical text.
 */
class RangeLength implements RuleInterface
{
    /**
     * Validate that a scalar's canonical text length is within [minimum, maximum].
     * An array or object value fails.
     *
     * @throws InvalidRuleParameter when the limits are not ordered integers from 0 to 9007199254740991
     */
    public function validate(mixed $value, mixed $param, array $allData, FieldPath $path): bool
    {
        [$minimum, $maximum] = LengthLimit::range($param);
        $length = LengthLimit::lengthOf($value);
        return $length !== null && $length >= $minimum && $length <= $maximum;
    }
}
