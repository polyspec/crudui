<?php
/**
 * Form Validation Endpoint (standalone)
 *
 * Implements the canonical POST /api/validate contract
 * (shared by node-api / php-api / go-api):
 *
 *   POST /validate.php
 *   Content-Type: application/json
 *
 *   {
 *     "spec": { ...form spec object... },
 *     "data": { ...form data to validate... }
 *   }
 *
 * Response — always 200, validation failure is NOT an HTTP error (no 422):
 *
 *   {
 *     "valid": bool,
 *     "errors": [{"field": "...", "rule": "...", "message": "..."}]
 *   }
 *
 * Server errors only use 4xx/5xx with {"error": "..."}.
 * Prefer api.php (router) for the full API: /api/specs, /api/specs/{name}, /api/validate.
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
    echo json_encode(['error' => 'Method not allowed. Use POST.']);
    exit;
}

// Load Composer autoloader
require_once __DIR__ . '/vendor/autoload.php';

use FormSpec\Validator\Validator;

/**
 * Map validator errors (keyed by path) to the canonical wire format.
 * Closure (not a named function): this file may run in the same process as
 * the api.php router under the PHP built-in server.
 */
$toWireErrors = static function (array $errors): array {
    $wire = [];
    foreach ($errors as $path => $error) {
        $wire[] = [
            'field' => $error['field'] ?? $path,
            'rule' => $error['rule'] ?? '',
            'message' => $error['message'] ?? '',
        ];
    }
    return $wire;
};

/**
 * Check that a spec has the canonical form-spec shape: a group whose
 * `properties` is an associative array. Anything else (arbitrary keys, a
 * missing `properties`, a non-group type) is malformed.
 * Closure (not a named function): this file may run in the same process as
 * the api.php router under the PHP built-in server.
 */
$isValidSpecShape = static function (mixed $spec): bool {
    if (!is_array($spec)) {
        return false;
    }
    if (($spec['type'] ?? null) !== 'group') {
        return false;
    }
    return isset($spec['properties']) && is_array($spec['properties']);
};

try {
    $input = json_decode((string) file_get_contents('php://input'), true);

    if (!is_array($input)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON in request body']);
        exit;
    }

    if (!isset($input['spec']) || !is_array($input['spec'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing or invalid field: spec']);
        exit;
    }

    // A valid form spec is a group with a properties object. Reject any other
    // shape with 400 instead of letting the validator return a misleading
    // valid:true. Keeps the three backends aligned: malformed specs are a
    // client error, not a silent pass.
    if (!$isValidSpecShape($input['spec'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid spec: expected a group with a properties object']);
        exit;
    }

    if (!isset($input['data']) || !is_array($input['data'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing or invalid field: data']);
        exit;
    }

    $validator = new Validator($input['spec']);
    $result = $validator->validate($input['data']);

    echo json_encode([
        'valid' => $result->isValid(),
        'errors' => $toWireErrors($result->getErrors()),
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
