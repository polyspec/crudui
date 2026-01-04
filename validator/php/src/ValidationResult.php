<?php

declare(strict_types=1);

namespace FormSpec\Validator;

/**
 * Represents the result of a validation operation.
 */
class ValidationResult
{
    /**
     * @param bool $valid Whether validation passed
     * @param array<string, array{field: string, rule: string, message: string, value: mixed}> $errors Validation errors indexed by field path
     */
    public function __construct(
        public readonly bool $valid,
        public readonly array $errors = []
    ) {
    }

    /**
     * Check if validation passed.
     */
    public function isValid(): bool
    {
        return $this->valid;
    }

    /**
     * Get all validation errors.
     *
     * @return array<string, array{field: string, rule: string, message: string, value: mixed}>
     */
    public function getErrors(): array
    {
        return $this->errors;
    }

    /**
     * Get error for a specific field.
     *
     * @return array{field: string, rule: string, message: string, value: mixed}|null
     */
    public function getError(string $path): ?array
    {
        return $this->errors[$path] ?? null;
    }

    /**
     * Check if a specific field has an error.
     */
    public function hasError(string $path): bool
    {
        return isset($this->errors[$path]);
    }

    /**
     * Get first error message.
     */
    public function getFirstError(): ?string
    {
        if (empty($this->errors)) {
            return null;
        }
        $key = array_key_first($this->errors);
        return $this->errors[$key]['message'] ?? null;
    }

    /**
     * Convert to array representation.
     *
     * @return array{valid: bool, errors: array}
     */
    public function toArray(): array
    {
        return [
            'valid' => $this->valid,
            'errors' => $this->errors,
        ];
    }
}
