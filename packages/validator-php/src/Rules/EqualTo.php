<?php

declare(strict_types=1);

namespace FormSpec\Validator\Rules;

/**
 * Equal To validation rule.
 * Validates that a value matches another field's value.
 */
class EqualTo implements RuleInterface
{
    /**
     * Validate that a value matches another field's value.
     */
    public function validate(mixed $value, mixed $param, array $allData, string $path): bool
    {
        if ($param === null || $param === '') {
            return true;
        }

        $targetPath = (string)$param;
        $targetValue = $this->getValueByPath($allData, $targetPath, $path);

        return $value === $targetValue;
    }

    /**
     * Get value from form data by path.
     */
    private function getValueByPath(array $data, string $targetPath, string $currentPath): mixed
    {
        // Handle relative paths
        if (str_starts_with($targetPath, '.')) {
            $currentParts = explode('.', $currentPath);
            array_pop($currentParts); // Remove current field name

            $relativeParts = explode('.', $targetPath);

            foreach ($relativeParts as $part) {
                if ($part === '') {
                    // Each leading dot means go up one level
                    if (!empty($currentParts)) {
                        array_pop($currentParts);
                    }
                } else {
                    $currentParts[] = $part;
                }
            }

            $targetPath = implode('.', $currentParts);
        }

        // Navigate to the target value
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
        return 'Please enter the same value again.';
    }
}
