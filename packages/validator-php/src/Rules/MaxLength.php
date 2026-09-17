<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Rules;

use CRUDUI\Validator\Values\InvalidRuleParameter;
use CRUDUI\Validator\Values\LengthLimit;

/**
 * Maximum length validation rule on the code points of the canonical text.
 */
class MaxLength implements RuleInterface
{
    /**
     * Validate that a scalar's canonical text has no more than the specified number of code points.
     * An array or object value fails.
     *
     * @throws InvalidRuleParameter when the limit is not an integer from 0 to 9007199254740991
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        $limit = LengthLimit::single('maxlength', $param);
        $length = LengthLimit::lengthOf($value);
        return $length !== null && $length <= $limit;
    }
}
