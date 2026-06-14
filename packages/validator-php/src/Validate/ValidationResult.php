<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Validate;

/**
 * CRUDUI validation result — { valid, errors } (schema G-B). Port of the JS
 * ValidationResult shape. `errors` is a flat list of error records, each
 * { path, field, rule, message, value }; idempotent with the legacy ValidationError
 * fields so the 4-language fixture compares bit-for-bit.
 */
final class ValidationResult
{
    /**
     * @param bool $valid true when `errors` is empty
     * @param list<array<string, mixed>> $errors flat list of error records
     */
    public function __construct(
        public readonly bool $valid,
        public readonly array $errors,
    ) {
    }

    /**
     * Plain-array form for fixture comparison (matches the shared fixture's
     * `expected` shape exactly).
     *
     * @return array{valid: bool, errors: list<array<string, mixed>>}
     */
    public function toArray(): array
    {
        return [
            'valid' => $this->valid,
            'errors' => $this->errors,
        ];
    }
}
