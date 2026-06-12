#!/usr/bin/env php
<?php
/**
 * PHP stdin validation worker for compare-all.js.
 *
 * Protocol (identical to the Go CLI in packages/validator-go/cmd/validate):
 *   stdin:  {"spec": <spec>, "input": <input>}
 *   stdout: {"valid": bool, "error"?: string|null, "field"?: string|null}
 *
 * Do NOT embed spec/input in argv. Do NOT add escaping logic here —
 * stdin carries raw JSON, no shell or PHP string quoting is involved.
 */

declare(strict_types=1);

require_once __DIR__ . '/../../packages/validator-php/vendor/autoload.php';

use FormSpec\Validator\Legacy\Validator;

$raw = stream_get_contents(STDIN);
if ($raw === false || trim($raw) === '') {
    fwrite(STDERR, "Empty stdin request\n");
    exit(1);
}

$request = json_decode($raw, true);
if (!is_array($request) || !array_key_exists('spec', $request)) {
    fwrite(STDERR, "Invalid request JSON: " . json_last_error_msg() . "\n");
    exit(1);
}

$spec = $request['spec'];
$input = $request['input'] ?? null;

// Convert spec: wrap simple field specs in a group with a 'value' property
if (!isset($spec['type']) || $spec['type'] !== 'group' || !isset($spec['properties'])) {
    $spec = ['type' => 'group', 'properties' => ['value' => $spec]];
    $input = ['value' => $input];
}

// Handle __undefined__ marker
if (is_array($input) && isset($input['value']) && $input['value'] === '__undefined__') {
    $input['value'] = null;
}

$validator = new Validator($spec);
$result = $validator->validate($input ?? []);

$output = ['valid' => $result->isValid()];
$errors = $result->getErrors();
if (!$result->isValid() && count($errors) > 0) {
    $firstError = reset($errors);
    $output['error'] = $firstError['rule'] ?? null;
    $output['field'] = $firstError['field'] ?? null;
}

echo json_encode($output);
