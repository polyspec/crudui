<?php
declare(strict_types=1);
require_once __DIR__ . '/repository.php';

/** Return a JSON response and finish the request. */
function respond(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (!str_starts_with($path, '/api/')) return false;

try {
    if ($path === '/api/health') respond(200, ['status' => 'ok', 'php' => PHP_VERSION, 'storage' => 'JSON files']);
    if (!preg_match('#^/api/(load|save|validate|reset)/(original|original-keyed|keyed)/(react|vue|svelte)$#', $path, $match)) respond(404, ['error' => 'Unknown endpoint']);
    [, $action, $mode, $framework] = $match;
    $dataMode = $mode === 'original' ? 'original' : 'keyed';
    $validatorSource = $mode === 'keyed' ? 'keyed' : 'original';
    $expectedMethod = $action === 'load' ? 'GET' : 'POST';
    if ($_SERVER['REQUEST_METHOD'] !== $expectedMethod) respond(405, ['error' => 'Method not allowed']);
    $repo = new FormRepository("/data/$mode-$framework.json");
    if ($action === 'reset' || $action === 'load') {
        $state = $action === 'reset' ? $repo->reset($_POST['fixture'] ?? 'default') : $repo->read();
        respond(200, ['storage' => $state, 'data' => FormRepository::loadData($state, $dataMode)]);
    }
    require_once "/workspace/$validatorSource/packages/validator-php/vendor/autoload.php";
    $spec = json_decode(file_get_contents("/workspace/public/spec-$dataMode.json"), true, 512, JSON_THROW_ON_ERROR);
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (str_starts_with($contentType, 'application/json')) {
        $raw = file_get_contents('php://input');
        $json = json_decode($raw, false, 512, JSON_THROW_ON_ERROR);
        FormRepository::checkJsonShape($json->form ?? null, $dataMode);
        $received = json_decode($raw, true, 512, JSON_THROW_ON_ERROR)['form'];
    } else {
        if (($_POST['_form_complete'] ?? '') !== '1') respond(400, ['error' => 'Incomplete native form submission']);
        $received = $_POST['form'] ?? [];
    }
    if (!is_array($received)) respond(400, ['error' => 'Expected form object']);
    $data = FormRepository::normalize($received, $dataMode);
    $validator = new \CRUDUI\Validator\Validate\Validator($spec);
    $validation = $validator->validate($data);
    $result = ['transport' => $contentType, 'validatorSource' => $validatorSource, 'received' => $received, 'normalized' => FormRepository::wireData($data, $dataMode), 'validation' => $validation];
    if ($action === 'validate') respond(200, $result);
    if (!$validation->valid) respond(422, $result);
    respond(200, [...$result, ...$repo->save($data, $dataMode)]);
} catch (InvalidArgumentException | JsonException $error) {
    respond(400, ['error' => $error->getMessage()]);
} catch (Throwable $error) {
    respond(500, ['error' => $error->getMessage()]);
}
