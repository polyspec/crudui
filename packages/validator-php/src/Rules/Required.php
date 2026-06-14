<?php

declare(strict_types=1);

namespace Polyspec\Validator\Rules;

/**
 * Required field validation rule.
 */
class Required implements RuleInterface
{
    /**
     * Validate that a value is not empty.
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        // If param is false, field is not required
        if ($param === false) {
            return true;
        }

        // Check for empty values
        if ($value === null) {
            return false;
        }

        if (is_string($value)) {
            return trim($value) !== '';
        }

        if (is_array($value)) {
            // For file uploads, check if file was uploaded
            if (isset($value['tmp_name']) && isset($value['error'])) {
                return $value['error'] === UPLOAD_ERR_OK && !empty($value['tmp_name']);
            }
            return count($value) > 0;
        }

        // Numbers, booleans, objects are considered present
        return true;
    }

    /**
     * Returns the default error message for this rule.
     *
     * @return string Default message, with {0}, {1} placeholders where applicable
     */
    public function getDefaultMessage(): string
    {
        return 'This field is required.';
    }
}
