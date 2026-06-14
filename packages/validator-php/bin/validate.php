#!/usr/bin/env php
<?php
/**
 * PHP CRUDUI stdin validation worker (gateway subprocess).
 *
 * Contract (parallel to the legacy worker tests/runner/validate-case.php and the
 * CRUDUI Go/Rust wrappers; the gateway spawns it with spawnSync, cwd = this
 * package root, encoding utf-8, the request piped on stdin):
 *
 *   stdin:  {"spec": <spec object>, "data": <data object>, "files"?: {key:<object>}, "basepath"?: <string>}
 *   stdout: {"valid": bool, "errors": [<error record>, ...]}
 *
 * `spec` is already a decoded object/JSON (no YAML, no file path). It runs the
 * full CRUDUI pipeline FormSpec\Validator\Validate\Validate::run — compose (G5)
 * → ForbiddenScan (§6) → Validate (§3 + §2 G1). This is a thin wrapper: it adds
 * no validation logic and never touches the legacy Validator (R7 parallel run).
 *
 * Failure surfaces:
 *   - A ComposeLoadError (unresolved $ref/$patch, or a forbidden meta key in the
 *     composed spec) is a LOAD failure, NOT valid:false: the spec never comes
 *     into existence. It is reported on stdout as {"valid": false, "errors":
 *     [{rule:"compose", code, message, ...}]} so the gateway distinguishes it
 *     from a data-level validation failure, with process exit 0.
 *   - A malformed request (bad JSON, missing spec) writes to STDERR and exits 1
 *     (the gateway treats status != 0 / empty stdout as an error envelope).
 *
 * Do NOT embed spec/data in argv. Do NOT add escaping logic — stdin carries raw
 * JSON, no shell or PHP string quoting is involved.
 */

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use FormSpec\Validator\Validate\Validate;
use FormSpec\Validator\Validate\ListValidate;
use FormSpec\Validator\Compose\ComposeLoadError;

$raw = stream_get_contents(STDIN);
if ($raw === false || trim($raw) === '') {
    fwrite(STDERR, "Empty stdin request\n");
    exit(1);
}

$request = json_decode($raw, true);
if (!is_array($request) || !array_key_exists('spec', $request)) {
    fwrite(STDERR, 'Invalid request JSON: ' . json_last_error_msg() . "\n");
    exit(1);
}

$spec = $request['spec'];
if (!is_array($spec)) {
    fwrite(STDERR, "Request `spec` must be an object\n");
    exit(1);
}

// Mode select: the default (absent or "form") runs the full form pipeline
// (compose → forbidden → validate). "list" runs the read sister — the
// four-language list STRUCTURE gate (compose → forbidden-scan, SPEC §9). list
// carries no data (rows are injected), so the list mode ignores `data`; the
// "schema shape" half (required/enum/additionalProperties/anyOf) stays with the
// meta-schema, not this engine. Form mode is untouched: a request with no `mode`
// behaves exactly as before.
$mode = $request['mode'] ?? 'form';
if (!is_string($mode)) {
    $mode = 'form';
}

$data = $request['data'] ?? [];
if (!is_array($data)) {
    $data = [];
}

// Optional virtual file set for $ref resolution + basepath for relative refs.
// The gateway sends the same { files, basepath } the JS/Go/Rust wrappers receive;
// omitting them here would make PHP report REF_FILE_NOT_FOUND on a spec the other
// three languages resolve — a wrapper-induced idempotency break.
$files = $request['files'] ?? null;
if ($files !== null && !is_array($files)) {
    $files = null;
}
$basepath = $request['basepath'] ?? '';
if (!is_string($basepath)) {
    $basepath = '';
}

try {
    if ($mode === 'list') {
        // Read sister — the four-language list structure gate (compose +
        // forbidden-scan, SPEC §9). No data pass (rows are injected). A clean load
        // is { valid:true, errors:[] }; a forbidden meta key / unresolved $ref is a
        // ComposeLoadError, surfaced on the shared LOAD wire below.
        $listResult = ListValidate::run($spec, $files, null, $basepath);
        $output = ['valid' => $listResult->valid, 'errors' => $listResult->errors];
    } else {
        $result = Validate::run($spec, $data, $files, null, $basepath);
        $output = ['valid' => $result->valid, 'errors' => $result->errors];
    }
} catch (ComposeLoadError $e) {
    // LOAD failure (unresolved composition / forbidden key) — never valid:true.
    // Reported on stdout (exit 0) as a synthetic `compose` error so the gateway
    // distinguishes it from a data validation failure without parsing STDERR.
    $output = [
        'valid' => false,
        'errors' => [[
            'path' => '',
            'field' => '',
            'rule' => 'compose',
            'code' => $e->getErrorCode(),
            'message' => $e->getMessage(),
            'value' => null,
        ]],
    ];
}

echo json_encode($output, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
