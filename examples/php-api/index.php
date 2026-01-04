<?php
/**
 * API Index / Documentation Endpoint
 *
 * Returns API documentation and available endpoints.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$documentation = [
    'name' => 'FormSpec Validation API',
    'version' => '1.0.0',
    'description' => 'PHP API for validating form data against YAML specifications',
    'endpoints' => [
        [
            'path' => '/validate.php',
            'method' => 'POST',
            'description' => 'Validate form data',
            'request' => [
                'spec' => 'string (required) - Specification name',
                'mode' => 'string (optional) - "full" or "field" (default: "full")',
                'data' => 'object (required for full mode) - Form data to validate',
                'path' => 'string (required for field mode) - Field path',
                'value' => 'any (required for field mode) - Field value',
                'allData' => 'object (optional for field mode) - All form data',
            ],
            'response' => [
                'success' => 'boolean - Request processed successfully',
                'valid' => 'boolean - Validation result',
                'errors' => 'object - Validation errors (full mode)',
                'error' => 'string|null - Validation error (field mode)',
            ],
        ],
    ],
    'available_specs' => getAvailableSpecs(),
    'examples' => [
        'full_validation' => [
            'request' => [
                'spec' => 'user-registration',
                'data' => [
                    'email' => 'user@example.com',
                    'password' => 'SecurePass123',
                    'password_confirm' => 'SecurePass123',
                    'name' => 'John Doe',
                    'terms' => true,
                ],
            ],
        ],
        'field_validation' => [
            'request' => [
                'spec' => 'user-registration',
                'mode' => 'field',
                'path' => 'email',
                'value' => 'test@example.com',
                'allData' => [],
            ],
        ],
    ],
];

echo json_encode($documentation, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

/**
 * Get list of available specification files.
 */
function getAvailableSpecs(): array
{
    $specsDir = __DIR__ . '/specs';
    $specs = [];

    if (is_dir($specsDir)) {
        $files = glob($specsDir . '/*.yml');
        foreach ($files as $file) {
            $specs[] = basename($file, '.yml');
        }
    }

    return $specs;
}
