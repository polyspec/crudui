<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Rules;

use CRUDUI\Validator\Values\Whitespace;

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

        $url = Whitespace::trim($value);
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
}
