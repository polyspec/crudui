<?php

declare(strict_types=1);

namespace FormSpec\Validator\Rules;

/**
 * Step validation rule.
 * Validates that a numeric value is a multiple of the specified step.
 */
class Step implements RuleInterface
{
    /**
     * Validate that a numeric value is a multiple of the step.
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        if (!is_numeric($value) || !is_numeric($param)) {
            return true;
        }

        $step = (float)$param;
        if ($step <= 0) {
            return true;
        }

        $numValue = (float)$value;

        // Handle floating point precision by working with integers
        $decimalPlaces = max(
            $this->getDecimalPlaces($numValue),
            $this->getDecimalPlaces($step)
        );

        $multiplier = pow(10, $decimalPlaces);
        $intValue = (int)round($numValue * $multiplier);
        $intStep = (int)round($step * $multiplier);

        return $intValue % $intStep === 0;
    }

    /**
     * Get the number of decimal places in a number.
     */
    private function getDecimalPlaces(float $num): int
    {
        $str = (string)$num;
        $decimalPos = strpos($str, '.');

        if ($decimalPos === false) {
            return 0;
        }

        return strlen($str) - $decimalPos - 1;
    }

    public function getDefaultMessage(): string
    {
        return 'Please enter a value that is a multiple of {0}.';
    }
}
