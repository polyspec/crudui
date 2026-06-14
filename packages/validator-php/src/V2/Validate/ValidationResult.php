<?php

declare(strict_types=1);

namespace FormSpec\Validator\V2\Validate;

/**
 * v2 validation result — { valid, errors } (SPEC-V2 G-B). Port of the JS
 * ValidationResult shape. `errors` is a flat list of error records, each
 * { path, field, rule, message, value }; idempotent with the v1 ValidationError
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
