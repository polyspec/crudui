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
    'name' => 'CRUDUI Validation API',
    'version' => '1.0.0',
    'description' => 'PHP API for validating form data against YAML specifications',
    'endpoints' => [
        [
            'path' => '/api/specs',
            'method' => 'GET',
            'description' => 'List all available form specs',
            'response' => [
                'specs' => 'string[] - Available spec names',
            ],
        ],
        [
            'path' => '/api/specs/{name}',
            'method' => 'GET',
            'description' => 'Get a form spec by name (YAML converted to JSON). 404 {"error"} when not found.',
            'response' => [
                'name' => 'string - Spec name',
                'spec' => 'object - Form spec',
            ],
        ],
        [
            'path' => '/api/validate',
            'method' => 'POST',
            'description' => 'Validate form data against a spec object. Always 200; validation failure is NOT an HTTP error.',
            'request' => [
                'spec' => 'object (required) - Form spec object',
                'data' => 'object (required) - Form data to validate',
            ],
            'response' => [
                'valid' => 'boolean - Validation result',
                'errors' => 'array - [{"field", "rule", "message"}], empty when valid',
            ],
        ],
    ],
    'available_specs' => getAvailableSpecs(),
    'examples' => [
        'validation' => [
            'request' => [
                'spec' => [
                    'type' => 'group',
                    'properties' => [
                        'email' => [
                            'type' => 'email',
                            'rules' => ['required' => true, 'email' => true],
                        ],
                    ],
                ],
                'data' => [
                    'email' => 'user@example.com',
                ],
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
        $files = glob($specsDir . '/*.{yml,yaml}', GLOB_BRACE) ?: [];
        foreach ($files as $file) {
            $specs[] = preg_replace('/\.(yml|yaml)$/', '', basename($file));
        }
    }

    sort($specs);
    return $specs;
}
