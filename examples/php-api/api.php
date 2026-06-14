<?php
/**
 * Form Validation API Router
 *
 * Canonical API contract (shared by node-api / php-api / go-api):
 *   GET  /api/specs        -> 200 {"specs": ["contact", ...]}
 *   GET  /api/specs/{name} -> 200 {"name": "...", "spec": {...}} | 404 {"error": "..."}
 *   POST /api/validate     -> body {"spec": {...}, "data": {...}}
 *                             always 200 {"valid": bool, "errors": [{"field","rule","message"}]}
 *   Server errors only use 4xx/5xx with {"error": "..."}.
 *   CORS: Access-Control-Allow-Origin * + OPTIONS preflight.
 *
 * Run with the PHP built-in server (api.php as router script):
 *   php -S localhost:8080 api.php
 */
declare(strict_types=1);

// PHP built-in server: serve existing files (validate.php, index.php, ...) directly
if (PHP_SAPI === 'cli-server') {
    $requestedFile = __DIR__ . (parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
    if ($requestedFile !== __DIR__ . '/' && is_file($requestedFile)) {
        return false;
    }
}

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/vendor/autoload.php';

use CRUDUI\Validator\Legacy\Validator;
use Symfony\Component\Yaml\Yaml;

const SPECS_DIR = __DIR__ . '/specs';

/**
 * Send a JSON response and exit.
 */
function respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Send an {"error": ...} response and exit.
 */
function respondError(int $status, string $message): void
{
    respond($status, ['error' => $message]);
}

/**
 * List all available spec names (.yml / .yaml, without extension).
 */
function listSpecs(): array
{
    $specs = [];
    foreach (glob(SPECS_DIR . '/*.{yml,yaml}', GLOB_BRACE) ?: [] as $file) {
        $specs[] = preg_replace('/\.(yml|yaml)$/', '', basename($file));
    }
    sort($specs);
    return $specs;
}

/**
 * Load a spec by name, or null when not found.
 */
function loadSpec(string $name): ?array
{
    // Sanitize spec name to prevent directory traversal
    $name = preg_replace('/[^a-zA-Z0-9_\-]/', '', $name);

    foreach (['yml', 'yaml'] as $ext) {
        $path = SPECS_DIR . "/{$name}.{$ext}";
        if (file_exists($path)) {
            $spec = Yaml::parseFile($path);
            return is_array($spec) ? $spec : null;
        }
    }

    return null;
}

/**
 * Check that a spec has the canonical crudui shape: a group whose
 * `properties` is an associative array. Anything else (arbitrary keys, a
 * missing `properties`, a non-group type) is malformed and is rejected with
 * 400 instead of being passed to the validator.
 */
function isValidSpecShape(mixed $spec): bool
{
    if (!is_array($spec)) {
        return false;
    }
    if (($spec['type'] ?? null) !== 'group') {
        return false;
    }
    return isset($spec['properties']) && is_array($spec['properties']);
}

/**
 * Map validator errors (keyed by path) to the canonical wire format.
 */
function toWireErrors(array $errors): array
{
    $wire = [];
    foreach ($errors as $path => $error) {
        $wire[] = [
            'field' => $error['field'] ?? $path,
            'rule' => $error['rule'] ?? '',
            'message' => $error['message'] ?? '',
        ];
    }
    return $wire;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$method = $_SERVER['REQUEST_METHOD'];

try {
    // GET /api/specs
    if ($path === '/api/specs') {
        if ($method !== 'GET') {
            respondError(405, 'Method not allowed');
        }
        respond(200, ['specs' => listSpecs()]);
    }

    // GET /api/specs/{name}
    if (preg_match('#^/api/specs/(.+)$#', $path, $m)) {
        if ($method !== 'GET') {
            respondError(405, 'Method not allowed');
        }
        $name = $m[1];
        $spec = loadSpec($name);
        if ($spec === null) {
            respondError(404, "Spec not found: {$name}");
        }
        respond(200, ['name' => $name, 'spec' => $spec]);
    }

    // POST /api/validate
    // Validation failure is NOT an HTTP error: always 200 with {valid, errors}.
    if ($path === '/api/validate') {
        if ($method !== 'POST') {
            respondError(405, 'Method not allowed');
        }

        $input = json_decode((string) file_get_contents('php://input'), true);
        if (!is_array($input)) {
            respondError(400, 'Invalid JSON in request body');
        }

        if (!isset($input['spec']) || !is_array($input['spec'])) {
            respondError(400, 'Missing or invalid field: spec');
        }
        if (!isValidSpecShape($input['spec'])) {
            respondError(400, 'Invalid spec: expected a group with a properties object');
        }
        if (!isset($input['data']) || !is_array($input['data'])) {
            respondError(400, 'Missing or invalid field: data');
        }

        $validator = new Validator($input['spec']);
        $result = $validator->validate($input['data']);

        respond(200, [
            'valid' => $result->isValid(),
            'errors' => toWireErrors($result->getErrors()),
        ]);
    }

    // GET /health
    if ($path === '/health') {
        respond(200, ['status' => 'ok']);
    }

    respondError(404, 'Endpoint not found');
} catch (Throwable $e) {
    respondError(500, $e->getMessage());
}
