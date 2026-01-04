<?php

declare(strict_types=1);

namespace FormSpec\Validator\Rules;

/**
 * In list validation rule.
 * Validates that a value is one of the allowed values.
 */
class In implements RuleInterface
{
    /**
     * Validate that a value is in the allowed list.
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        if ($param === false) {
            return true;
        }

        // Build the allowed values list
        $allowedValues = $this->flattenValues($param);

        if (empty($allowedValues)) {
            return true;
        }

        // Handle array values (check if all items are in allowed list)
        if (is_array($value)) {
            foreach ($value as $item) {
                if (!$this->isInList($item, $allowedValues)) {
                    return false;
                }
            }
            return true;
        }

        return $this->isInList($value, $allowedValues);
    }

    /**
     * Flatten a nested array of values.
     */
    private function flattenValues(mixed $param): array
    {
        if (!is_array($param)) {
            // Handle comma-separated string
            if (is_string($param)) {
                return array_map('trim', explode(',', $param));
            }
            return [$param];
        }

        $result = [];
        array_walk_recursive($param, function ($value) use (&$result) {
            $result[] = $value;
        });

        return $result;
    }

    /**
     * Check if a value is in the allowed list (with loose comparison).
     */
    private function isInList(mixed $value, array $allowedValues): bool
    {
        // Normalize the value for comparison
        $normalizedValue = $this->normalize($value);

        foreach ($allowedValues as $allowed) {
            $normalizedAllowed = $this->normalize($allowed);

            // Strict string comparison after normalization
            if ($normalizedValue === $normalizedAllowed) {
                return true;
            }

            // Also try numeric comparison
            if (is_numeric($normalizedValue) && is_numeric($normalizedAllowed)) {
                if ((float)$normalizedValue === (float)$normalizedAllowed) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Normalize a value for comparison.
     */
    private function normalize(mixed $value): string
    {
        if ($value === null) {
            return '';
        }
        if (is_bool($value)) {
            return $value ? '1' : '0';
        }
        return trim((string)$value);
    }

    public function getDefaultMessage(): string
    {
        return 'Please select a valid option.';
    }
}
