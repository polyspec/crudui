<?php
declare(strict_types=1);
require_once __DIR__ . '/repository.php';
require_once __DIR__ . '/generation.php';

/** Return a JSON response and finish the request. */
function respond(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo FormJson::encode([...$body, 'server' => phpServerMode(), 'nativeJson' => extension_loaded('ordered_json')]);
    exit;
}

/** Open the current library and its recorded source metadata. */
function currentGeneration(): FormGeneration
{
    $source = FormJson::decode(file_get_contents('/workspace/metadata.json'));
    if (!$source instanceof stdClass || !($source->source ?? null) instanceof stdClass) throw new RuntimeException('Missing current library metadata');
    $runtime = phpServerMode();
    $archiveSha256 = getenv('FORM_CRUDUI_ARCHIVE_SHA256') ?: '';
    $moduleSha256 = getenv('FORM_CRUDUI_MODULE_SHA256');
    return new FormGeneration(
        $runtime,
        '/workspace/source',
        $source->source,
        $archiveSha256,
        $moduleSha256 === false ? null : $moduleSha256,
    );
}

/** Decode one JSON object request within the HTTP size limit. */
function jsonRequest(): stdClass
{
    $raw = file_get_contents('php://input');
    if ($raw === false) throw new RuntimeException('Cannot read the request');
    if (strlen($raw) > 2 * 1024 * 1024) respond(413, ['error' => 'Request exceeds 2 MiB']);
    $request = FormJson::decode($raw);
    if (!$request instanceof stdClass) throw new InvalidArgumentException('Expected request object');
    return $request;
}

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (!str_starts_with($path, '/api/')) return false;

try {
    if ($path === '/api/health') respond(200, ['status' => 'ok', 'php' => PHP_VERSION, 'storage' => 'JSON files', 'jsonProcessor' => 'ordered-json', 'generator' => currentGeneration()->provenance()]);
    if (!preg_match('#^/api/(load|save|validate|reset|compile|render|ssr)/(bindForm|createForm)/(react|vue|svelte)$#', $path, $match)) respond(404, ['error' => 'Unknown endpoint']);
    [, $action, $renderingPath, $framework] = $match;
    $expectedMethod = in_array($action, ['load', 'ssr'], true) ? 'GET' : 'POST';
    if ($_SERVER['REQUEST_METHOD'] !== $expectedMethod) respond(405, ['error' => 'Method not allowed']);
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 2 * 1024 * 1024) respond(413, ['error' => 'Request exceeds 2 MiB']);
    if ($_FILES !== []) respond(400, ['error' => 'File uploads are not part of this form']);
    $contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
    $generation = currentGeneration();
    if ($action === 'compile' || $action === 'render') {
        if ($contentType !== 'application/json') respond(415, ['error' => 'Expected a JSON request']);
        respond(200, $generation->$action(jsonRequest()));
    }
    if ($action === 'reset' && !in_array($contentType, ['multipart/form-data', 'application/x-www-form-urlencoded'], true)) respond(415, ['error' => 'Expected a native form']);
    $repo = new FormRepository("/data/" . phpServerMode() . "-$renderingPath-$framework.json");
    if ($action === 'ssr') {
        $language = $_GET['language'] ?? 'ko';
        if (!is_string($language) || !in_array($language, ['ko', 'en'], true)) respond(400, ['error' => 'Expected language ko or en']);
        $spec = FormJson::decode(file_get_contents('/workspace/public/spec.json'));
        $document = $generation->document($spec, FormRepository::loadData($repo->read()), $renderingPath, $framework, $language);
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-store');
        echo $document;
        exit;
    }
    if ($action === 'reset' || $action === 'load') {
        if (!is_string($_POST['fixture'] ?? 'default')) respond(400, ['error' => 'Expected fixture name']);
        $state = $action === 'reset' ? $repo->reset($_POST['fixture'] ?? 'default') : $repo->read();
        respond(200, ['storage' => $state, 'data' => FormRepository::loadData($state), 'generator' => $generation->provenance()]);
    }
    $spec = FormJson::decode(file_get_contents('/workspace/public/spec.json'));
    if ($contentType === 'application/json') {
        $json = jsonRequest();
        FormRepository::checkJsonShape($json->form ?? null);
        $wireReceived = $json->form;
        $received = FormJson::arrays($wireReceived);
    } elseif (in_array($contentType, ['multipart/form-data', 'application/x-www-form-urlencoded'], true)) {
        if (($_POST['_form_complete'] ?? '') !== '1') respond(400, ['error' => 'Incomplete native form submission']);
        $received = $_POST['form'] ?? [];
        $wireReceived = $received;
    } else respond(415, ['error' => 'Expected a form or JSON request']);
    if (!is_array($received)) respond(400, ['error' => 'Expected form object']);
    $data = FormRepository::normalize($received);
    $normalized = FormRepository::wireData($data);
    $validation = (array) \CRUDUI\Validator::validate($spec, $normalized);
    $result = ['transport' => $contentType, 'jsonProcessor' => 'ordered-json', 'validatorSource' => 'current', 'received' => $wireReceived, 'normalized' => $normalized, 'validation' => $validation, 'generator' => $generation->provenance()];
    if ($action === 'validate') respond(200, $result);
    if (!$validation['valid']) respond(422, $result);
    respond(200, [...$result, ...$repo->save($data)]);
} catch (\CRUDUI\FormError $error) {
    respond(400, ['error' => $error->getMessage(), 'code' => $error->getErrorCode(), 'at' => $error->getPath()]);
} catch (\CRUDUI\Validator\Compose\ComposeLoadError $error) {
    respond(400, ['error' => $error->getMessage(), 'code' => $error->getErrorCode(), 'trace' => $error->getCompositionTrace()]);
} catch (InvalidArgumentException | JsonException | UnexpectedValueException | TypeError $error) {
    respond(400, ['error' => $error->getMessage()]);
} catch (Throwable $error) {
    respond(500, ['error' => $error->getMessage()]);
}
