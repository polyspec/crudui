<?php

declare(strict_types=1);

namespace FormSpec\Validator\Rules;

/**
 * Not Equal validation rule.
 * Validates that a value is different from a specified value or another field's value.
 */
class NotEqual implements RuleInterface
{
    /**
     * Validate that a value is different from the specified value or field.
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        if ($param === null) {
            return true;
        }

        $compareValue = $param;

        // Check if param is a field path (starts with .)
        if (is_string($param) && str_starts_with($param, '.')) {
            $compareValue = $this->getValueByPath($allData, $param, $path);
        }

        return $value !== $compareValue;
    }

    /**
     * Get value from form data by path.
     */
    private function getValueByPath(array $data, string $targetPath, string $currentPath): mixed
    {
        // Handle relative paths
        if (str_starts_with($targetPath, '.')) {
            $currentParts = explode('.', $currentPath);
            array_pop($currentParts);

            $relativeParts = explode('.', $targetPath);

            foreach ($relativeParts as $part) {
                if ($part === '') {
                    if (!empty($currentParts)) {
                        array_pop($currentParts);
                    }
                } else {
                    $currentParts[] = $part;
                }
            }

            $targetPath = implode('.', $currentParts);
        }

        $segments = explode('.', $targetPath);
        $current = $data;

        foreach ($segments as $segment) {
            if ($segment === '') {
                continue;
            }
            if (!is_array($current) || !array_key_exists($segment, $current)) {
                return null;
            }
            $current = $current[$segment];
        }

        return $current;
    }

    public function getDefaultMessage(): string
    {
        return 'Please enter a different value.';
    }
}
