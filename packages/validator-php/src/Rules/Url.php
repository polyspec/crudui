<?php

declare(strict_types=1);

namespace Polyspec\Validator\Rules;

/**
 * URL validation rule.
 * Validates that a value is a valid URL.
 */
class Url implements RuleInterface
{
    /**
     * Validate that a value is a valid URL.
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        if ($param === false) {
            return true;
        }

        if (!is_string($value)) {
            return false;
        }

        $url = trim($value);
        if ($url === '') {
            return false;
        }

        // Use PHP's built-in URL validation
        $result = filter_var($url, FILTER_VALIDATE_URL);

        if ($result === false) {
            return false;
        }

        // Additional check for allowed protocols
        $parsed = parse_url($url);
        if (!isset($parsed['scheme'])) {
            return false;
        }

        return in_array(strtolower($parsed['scheme']), ['http', 'https', 'ftp'], true);
    }

    /**
     * Returns the default error message for this rule.
     *
     * @return string Default message, with {0}, {1} placeholders where applicable
     */
    public function getDefaultMessage(): string
    {
        return 'Please enter a valid URL.';
    }
}
