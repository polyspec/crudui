<?php
declare(strict_types=1);
require_once __DIR__ . '/repository.php';

/** Return a JSON response and finish the request. */
function respond(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo FormJson::encode([...$body, 'server' => 'php']);
    exit;
}

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (!str_starts_with($path, '/api/')) return false;

try {
    if ($path === '/api/health') respond(200, ['status' => 'ok', 'php' => PHP_VERSION, 'storage' => 'JSON files', 'jsonProcessor' => 'ordered-json']);
    if (!preg_match('#^/api/(load|save|validate|reset)/(corrected|original|original-keyed|keyed)/(react|vue|svelte)$#', $path, $match)) respond(404, ['error' => 'Unknown endpoint']);
    [, $action, $mode, $framework] = $match;
    $dataMode = $mode === 'original' ? 'original' : 'keyed';
    $validatorSource = in_array($mode, ['corrected', 'keyed'], true) ? $mode : 'original';
    $expectedMethod = $action === 'load' ? 'GET' : 'POST';
    if ($_SERVER['REQUEST_METHOD'] !== $expectedMethod) respond(405, ['error' => 'Method not allowed']);
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 2 * 1024 * 1024) respond(413, ['error' => 'Request exceeds 2 MiB']);
    if ($_FILES !== []) respond(400, ['error' => 'File uploads are not part of this form']);
    $contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
    if ($action === 'reset' && !in_array($contentType, ['multipart/form-data', 'application/x-www-form-urlencoded'], true)) respond(415, ['error' => 'Expected a native form']);
    $repo = new FormRepository("/data/php-$mode-$framework.json");
    if ($action === 'reset' || $action === 'load') {
        if (!is_string($_POST['fixture'] ?? 'default')) respond(400, ['error' => 'Expected fixture name']);
        $state = $action === 'reset' ? $repo->reset($_POST['fixture'] ?? 'default') : $repo->read();
        respond(200, ['storage' => $state, 'data' => FormRepository::loadData($state, $dataMode)]);
    }
    require_once "/workspace/$validatorSource/packages/validator-php/vendor/autoload.php";
    $spec = FormJson::arrays(FormJson::decode(file_get_contents("/workspace/public/spec-$dataMode.json")));
    if ($contentType === 'application/json') {
        $raw = file_get_contents('php://input');
        if (strlen($raw) > 2 * 1024 * 1024) respond(413, ['error' => 'Request exceeds 2 MiB']);
        $json = FormJson::decode($raw);
        FormRepository::checkJsonShape($json->form ?? null, $dataMode);
        $wireReceived = $json->form;
        $received = FormJson::arrays($wireReceived);
    } elseif (in_array($contentType, ['multipart/form-data', 'application/x-www-form-urlencoded'], true)) {
        if (($_POST['_form_complete'] ?? '') !== '1') respond(400, ['error' => 'Incomplete native form submission']);
        $received = $_POST['form'] ?? [];
        $wireReceived = $received;
    } else respond(415, ['error' => 'Expected a form or JSON request']);
    if (!is_array($received)) respond(400, ['error' => 'Expected form object']);
    $data = FormRepository::normalize($received, $dataMode);
    $validator = $validatorSource === 'keyed'
        ? new \CRUDUI\Validator\Validate\Validator($spec)
        : new \CRUDUI\Validator\V2\Validate\Validator($spec);
    $validation = $validator->validate($data);
    $result = ['transport' => $contentType, 'jsonProcessor' => 'ordered-json', 'validatorSource' => $validatorSource, 'received' => $wireReceived, 'normalized' => FormRepository::wireData($data, $dataMode), 'validation' => $validation->toArray()];
    if ($action === 'validate') respond(200, $result);
    if (!$validation->valid) respond(422, $result);
    respond(200, [...$result, ...$repo->save($data, $dataMode)]);
} catch (InvalidArgumentException | JsonException | UnexpectedValueException $error) {
    respond(400, ['error' => $error->getMessage()]);
} catch (Throwable $error) {
    respond(500, ['error' => $error->getMessage()]);
}
