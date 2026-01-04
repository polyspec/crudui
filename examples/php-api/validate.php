<?php
/**
 * Form Validation API Endpoint
 *
 * A simple REST API for validating form data against YAML specifications.
 * Compatible with Limepie PHP form system.
 *
 * Usage:
 *   POST /validate.php
 *   Content-Type: application/json
 *
 *   {
 *     "spec": "user-registration",
 *     "data": { ... },
 *     "mode": "full" | "field",
 *     "path": "field.path",      // required when mode is "field"
 *     "value": "field value",    // required when mode is "field"
 *     "lang": "ko" | "en" | "ja" // optional, default: "ko"
 *   }
 */

declare(strict_types=1);

// CORS headers for API access
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'error' => 'Method not allowed. Use POST.',
    ]);
    exit;
}

// Load Composer autoloader
require_once __DIR__ . '/vendor/autoload.php';

use FormSpec\Validator\Legacy\Validator;
use Symfony\Component\Yaml\Yaml;

/**
 * Main API handler
 */
function handleRequest(): array
{
    // Parse request body
    $input = json_decode(file_get_contents('php://input'), true);

    if ($input === null && json_last_error() !== JSON_ERROR_NONE) {
        throw new InvalidArgumentException('Invalid JSON in request body');
    }

    // Get spec name and load specification
    $specName = $input['spec'] ?? 'default';
    $spec = loadSpec($specName);

    // Create validator instance
    $validator = new Validator($spec);

    // Get validation mode
    $mode = $input['mode'] ?? 'full';

    if ($mode === 'field') {
        // Single field validation (for real-time validation)
        return validateField($validator, $input);
    } else {
        // Full form validation
        return validateForm($validator, $input);
    }
}

/**
 * Load specification from YAML file
 */
function loadSpec(string $specName): array
{
    // Sanitize spec name to prevent directory traversal
    $specName = preg_replace('/[^a-zA-Z0-9_\-]/', '', $specName);

    $specPath = __DIR__ . "/specs/{$specName}.yml";

    if (!file_exists($specPath)) {
        throw new InvalidArgumentException("Specification not found: {$specName}");
    }

    $spec = Yaml::parseFile($specPath);

    if (!is_array($spec)) {
        throw new RuntimeException("Failed to parse specification: {$specName}");
    }

    return $spec;
}

/**
 * Validate entire form data
 */
function validateForm(Validator $validator, array $input): array
{
    $data = $input['data'] ?? [];

    $result = $validator->validate($data);

    return [
        'success' => true,
        'valid' => $result->isValid(),
        'errors' => $result->getErrors(),
        'firstError' => $result->getFirstError(),
    ];
}

/**
 * Validate a single field (for AJAX real-time validation)
 */
function validateField(Validator $validator, array $input): array
{
    $path = $input['path'] ?? '';
    $value = $input['value'] ?? null;
    $allData = $input['allData'] ?? [];

    if (empty($path)) {
        throw new InvalidArgumentException('Field path is required for field validation');
    }

    $error = $validator->validateField($path, $value, $allData);

    return [
        'success' => true,
        'valid' => $error === null,
        'error' => $error,
        'path' => $path,
    ];
}

// Execute the request handler
try {
    $response = handleRequest();
    echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
} catch (InvalidArgumentException $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
        'trace' => $e->getTraceAsString(),
    ], JSON_UNESCAPED_UNICODE);
}
