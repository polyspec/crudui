<?php
/**
 * Simple Form Validation API
 */
declare(strict_types=1);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Use POST']);
    exit;
}

require_once __DIR__ . '/vendor/autoload.php';

use FormSpec\Validator\Legacy\Validator;
use Symfony\Component\Yaml\Yaml;

try {
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input) {
        throw new Exception('Invalid JSON');
    }

    $specName = preg_replace('/[^a-zA-Z0-9_\-]/', '', $input['spec'] ?? 'contact');
    $specPath = __DIR__ . "/specs/{$specName}.yml";

    if (!file_exists($specPath)) {
        throw new Exception("Spec not found: {$specName}");
    }

    $spec = Yaml::parseFile($specPath);
    $validator = new Validator($spec);
    $result = $validator->validate($input['data'] ?? []);

    // Convert errors to array format (same as Node.js/Go)
    $errors = [];
    foreach ($result->getErrors() as $path => $error) {
        $errors[] = [
            'field' => $path,
            'rule' => $error['rule'],
            'message' => $error['message']
        ];
    }

    echo json_encode([
        'success' => true,
        'valid' => $result->isValid(),
        'errors' => $errors
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
