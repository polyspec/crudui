<?php

declare(strict_types=1);

namespace FormSpec\Validator\Rules;

/**
 * Interface for validation rules.
 */
interface RuleInterface
{
    /**
     * Validate a value against this rule.
     *
     * @param mixed $value The value to validate
     * @param mixed $param The rule parameter (e.g., min length, pattern, etc.)
     * @param array $allData All form data (for cross-field validation)
     * @param string $path The current field path (dot notation)
     * @return bool True if valid, false otherwise
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool;

    /**
     * Get the default error message for this rule.
     *
     * @return string The default error message with optional {0}, {1} placeholders
     */
    public function getDefaultMessage(): string;
}
