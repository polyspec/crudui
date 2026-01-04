<?php

declare(strict_types=1);

namespace FormSpec\Validator\Rules;

/**
 * Regular expression pattern matching validation rule.
 * Note: Named "Pattern" instead of "Match" because "match" is a reserved keyword in PHP 8.0+.
 * The rule is still registered as "match" in the Validator.
 */
class Pattern implements RuleInterface
{
    /**
     * Validate that a value matches the specified regex pattern.
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        if (!is_string($param) || $param === '') {
            return true;
        }

        $stringValue = (string)$value;

        // Build the pattern - wrap with delimiters and anchors if not already present
        $pattern = $param;

        // Check if pattern already has delimiters
        $firstChar = $pattern[0] ?? '';
        $hasDelimiters = in_array($firstChar, ['/', '#', '~', '%', '@'], true) &&
                         preg_match('/^..*.[gimsuxy]*$/s', $pattern);

        if (!$hasDelimiters) {
            // Add anchors if not present
            if (!str_starts_with($pattern, '^')) {
                $pattern = '^' . $pattern;
            }
            if (!str_ends_with($pattern, '$')) {
                $pattern = $pattern . '$';
            }
            // Use ~ as delimiter to avoid escaping / in patterns
            $pattern = '~' . $pattern . '~u';
        }

        try {
            return preg_match($pattern, $stringValue) === 1;
        } catch (\Throwable $e) {
            // Invalid pattern, return false
            return false;
        }
    }

    public function getDefaultMessage(): string
    {
        return 'Please enter a valid format.';
    }
}
