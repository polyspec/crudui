<?php
declare(strict_types=1);
require_once __DIR__ . '/repository.php';
require_once __DIR__ . '/generation.php';
require_once __DIR__ . '/matrix.php';
require_once __DIR__ . '/records.php';

/** Return a JSON response and finish the request. The record resource names only the server. */
function respond(int $status, array $body, bool $records = false): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    $server = ['server' => phpServerMode()];
    echo FormJson::encode($records ? [...$body, ...$server] : [...$body, ...$server, 'nativeJson' => extension_loaded('ordered_json')]);
    exit;
}

// The build tree that contains this file, and the directories the process was started with.
define('FORM_SOURCE_ROOT', dirname(__DIR__, 2));

/** Return one absolute directory named by an environment variable. */
function environmentDirectory(string $name): string
{
    $directory = getenv($name);
    if (!is_string($directory) || !str_starts_with($directory, '/') || !is_dir($directory)) {
        throw new RuntimeException("$name must name an absolute directory");
    }
    return rtrim($directory, '/');
}
define('FORM_PUBLIC_DIRECTORY', environmentDirectory('FORM_PUBLIC_DIRECTORY'));
define('FORM_DATA_DIRECTORY', environmentDirectory('FORM_DATA_DIRECTORY'));

/** Open the current library with the source identity published for the running build. */
function currentGeneration(): FormGeneration
{
    $raw = file_get_contents(FORM_PUBLIC_DIRECTORY . '/source.json');
    $source = is_string($raw) ? FormJson::decode($raw) : null;
    if (!$source instanceof stdClass) throw new RuntimeException('Missing source identity');
    $moduleSha256 = getenv('FORM_CRUDUI_MODULE_SHA256');
    return new FormGeneration(
        phpServerMode(),
        FORM_SOURCE_ROOT,
        $source,
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

/**
 * Return the SSR frame language after requiring exactly lang, server and initialization once each.
 * The query is parsed as application/x-www-form-urlencoded: empty parts are ignored and a part without "=" has an empty value.
 */
function ssrLanguage(string $query): string
{
    $parameters = [];
    foreach (explode('&', $query) as $pair) {
        if ($pair === '') continue;
        [$name, $value] = array_pad(explode('=', $pair, 2), 2, '');
        $name = urldecode($name);
        if (array_key_exists($name, $parameters)) respond(400, ['error' => 'Expected lang, server and initialization for this SSR frame']);
        $parameters[$name] = urldecode($value);
    }
    ksort($parameters);
    $language = $parameters['lang'] ?? null;
    if (array_keys($parameters) !== ['initialization', 'lang', 'server'] || !in_array($language, ['ko', 'en'], true)
        || $parameters['server'] !== phpServerMode() || $parameters['initialization'] !== 'ssr') {
        respond(400, ['error' => 'Expected lang, server and initialization for this SSR frame']);
    }
    return $language;
}

/** Answer one record failure. */
function recordFailure(int $status, string $message): never
{
    respond($status, ['error' => $message], true);
}

/**
 * Split an application/x-www-form-urlencoded query into its name and value pairs in order;
 * empty parts are ignored and a part without "=" has an empty value.
 */
function queryPairs(string $query): array
{
    $pairs = [];
    foreach (explode('&', $query) as $part) {
        if ($part === '') continue;
        [$name, $value] = array_pad(explode('=', $part, 2), 2, '');
        $pairs[] = [urldecode($name), urldecode($value)];
    }
    return $pairs;
}

/** Return a decimal integer from 1 without sign or leading zero, or null. */
function positiveInteger(string $text): ?int
{
    return preg_match('/^[1-9][0-9]{0,8}$/D', $text) ? (int) $text : null;
}

/** The media type of the request, without parameters. */
function requestMediaType(): string
{
    return strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
}

/** Whether the request carries a body. */
function requestHasBody(): bool
{
    return (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0 || $_POST !== [] || $_FILES !== [] || file_get_contents('php://input') !== '';
}

/** The customer specifications with the selection query appended to the list and detail links. */
function stageSpecs(string $selection): stdClass
{
    $specs = FormJson::decode((string) file_get_contents(FORM_PUBLIC_DIRECTORY . '/customer-specs.json'));
    $specs->list->columns->name->format->href .= '&' . $selection;
    $specs->detail->fields->id->format->href .= '&' . $selection;
    return $specs;
}

/**
 * Parse the query of one view request: `id` for detail and form, then exactly lang, server,
 * framework, initialization, mode and page, each once and in that order.
 */
function viewQuery(string $view): array
{
    $names = [...($view === 'list' ? [] : ['id']), 'lang', 'server', 'framework', 'initialization', 'mode', 'page'];
    $pairs = queryPairs($_SERVER['QUERY_STRING'] ?? '');
    if (array_column($pairs, 0) !== $names) recordFailure(400, 'Expected ' . implode(', ', $names));
    $query = array_combine($names, array_column($pairs, 1));
    $allowed = [
        'lang' => ['ko', 'en'], 'server' => [phpServerMode()], 'framework' => ['html', 'react', 'vue', 'svelte'],
        'initialization' => ['ssr'], 'mode' => ['bindForm', 'createForm'],
    ];
    foreach ($allowed as $name => $values) {
        if (!in_array($query[$name], $values, true)) recordFailure(400, "Unexpected $name");
    }
    $page = positiveInteger($query['page']);
    if ($page === null) recordFailure(400, 'Unexpected page');
    if ($view !== 'list' && positiveInteger($query['id']) === null) recordFailure(400, 'Unexpected id');
    return [...$query, 'page' => $page];
}

/** Render one SSR stage of the record flow. */
function recordView(RecordStore $store, string $view): never
{
    if (!in_array($view, ['list', 'detail', 'form'], true)) recordFailure(404, 'View not found');
    $query = viewQuery($view);
    $selection = implode('&', array_map(
        static fn(string $name): string => $name . '=' . rawurlencode((string) $query[$name]),
        ['lang', 'server', 'framework', 'initialization', 'mode', 'page'],
    ));
    $records = $store->read();
    $language = $query['lang'];
    $specs = stageSpecs($selection);
    if ($view === 'list') {
        $rows = RecordStore::page($records, $query['page']);
        if ($rows === null) recordFailure(404, 'Page not found');
        $html = \CRUDUI\Generator::renderList($specs->list, $rows, ['language' => $language, 'layout' => 'table', 'page' => $query['page'], 'total' => count($records)]);
        $data = ['page' => $query['page'], 'perPage' => RecordStore::PER_PAGE, 'total' => count($records), 'records' => $rows];
    } else {
        $record = RecordStore::find($records, $query['id']);
        if ($record === null) recordFailure(404, 'Record not found');
        if ($view === 'detail') {
            $html = \CRUDUI\Generator::renderDetail($specs->detail, $record, ['language' => $language]);
        } else {
            $template = \CRUDUI\Generator::compileForm($specs->form, ['keyPrefix' => 'form']);
            $form = new \CRUDUI\Form($template, RecordStore::formData($record), ['language' => $language]);
            $html = '<form id="record-form" method="post" action="/api/' . $query['server'] . '/records/' . $record->id . '" '
                . 'enctype="multipart/form-data">' . \CRUDUI\Generator::renderForm($form) . '</form>';
        }
        $data = ['record' => $record];
    }
    respond(200, ['view' => $view, 'html' => $html, 'data' => $data], true);
}

/** Read the submitted form of a native or JSON save request, answering 400 or 413 for a request it cannot take. */
function recordSubmission(): stdClass
{
    if (requestMediaType() === 'application/json') {
        $raw = file_get_contents('php://input');
        if (!is_string($raw)) throw new RuntimeException('Cannot read the request');
        if (strlen($raw) > 2 * 1024 * 1024) recordFailure(413, 'Request exceeds 2 MiB');
        $request = FormJson::decode($raw);
        if (!$request instanceof stdClass || array_keys(get_object_vars($request)) !== ['form']) recordFailure(400, 'Expected a request object with exactly form');
        return RecordStore::submission($request->form);
    }
    if ($_FILES !== []) recordFailure(400, 'File uploads are not part of this form');
    if (($_POST['_form_complete'] ?? null) !== '1') recordFailure(400, 'Incomplete native form submission');
    $fields = array_keys($_POST);
    sort($fields);
    if ($fields !== ['_form_complete', 'form']) recordFailure(400, 'Expected exactly the form fields');
    return RecordStore::submission($_POST['form']);
}

/** Answer one request of the record resource (docs/spec/form-comparison.md, "Record resource"). */
function recordRoute(string $path): never
{
    try {
        // Opening the generation loads and verifies the selected CRUDUI implementation.
        currentGeneration();
        $method = $_SERVER['REQUEST_METHOD'] ?? '';
        $store = new RecordStore(FORM_DATA_DIRECTORY . '/records-' . phpServerMode() . '.json', FORM_PUBLIC_DIRECTORY . '/customer-records.json');
        if ($path === '/api/records') {
            if ($method !== 'GET') recordFailure(405, 'Method not allowed');
            $pairs = queryPairs($_SERVER['QUERY_STRING'] ?? '');
            $page = count($pairs) === 1 && $pairs[0][0] === 'page' ? positiveInteger($pairs[0][1]) : null;
            if ($page === null) recordFailure(400, 'Expected one page parameter');
            $records = $store->read();
            $rows = RecordStore::page($records, $page);
            if ($rows === null) recordFailure(404, 'Page not found');
            respond(200, ['page' => $page, 'perPage' => RecordStore::PER_PAGE, 'total' => count($records), 'records' => $rows], true);
        }
        if (preg_match('#^/api/records/view/([^/]+)$#D', $path, $match)) {
            if ($method !== 'GET') recordFailure(405, 'Method not allowed');
            recordView($store, $match[1]);
        }
        if ($path === '/api/records/reset') {
            if ($method !== 'POST') recordFailure(405, 'Method not allowed');
            if (requestHasBody()) recordFailure(400, 'Reset takes no request body');
            respond(200, ['total' => $store->reset()], true);
        }
        if (!preg_match('#^/api/records/([^/]+)$#D', $path, $match)) recordFailure(404, 'Unknown endpoint');
        $id = $match[1];
        if ($method === 'GET') {
            $record = RecordStore::find($store->read(), $id);
            if ($record === null) recordFailure(404, 'Record not found');
            respond(200, ['record' => $record], true);
        }
        if ($method !== 'POST') recordFailure(405, 'Method not allowed');
        if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 2 * 1024 * 1024) recordFailure(413, 'Request exceeds 2 MiB');
        $type = requestMediaType();
        if (!in_array($type, ['multipart/form-data', 'application/x-www-form-urlencoded', 'application/json'], true)) recordFailure(415, 'Expected a native form or JSON');
        if (RecordStore::find($store->read(), $id) === null) recordFailure(404, 'Record not found');
        $submitted = recordSubmission();
        if ($submitted->id !== $id) recordFailure(400, 'The submitted id differs from the path id');
        $specs = FormJson::decode((string) file_get_contents(FORM_PUBLIC_DIRECTORY . '/customer-specs.json'));
        $validation = \CRUDUI\Validator::validate($specs->form, $submitted);
        if ($validation->valid !== true) respond(422, ['validation' => $validation], true);
        $record = $store->save($id, $submitted);
        if ($record === null) recordFailure(404, 'Record not found');
        respond(200, ['record' => $record, 'validation' => $validation], true);
    } catch (InvalidArgumentException | JsonException | UnexpectedValueException | \CRUDUI\FormError $error) {
        recordFailure(400, $error->getMessage());
    } catch (Throwable $error) {
        recordFailure(500, $error->getMessage());
    }
}

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (!str_starts_with($path, '/api/')) return false;

try {
    if ($path === '/api/health') respond(200, ['status' => 'ok', 'php' => PHP_VERSION, 'storage' => 'JSON files', 'jsonProcessor' => 'ordered-json', 'generator' => currentGeneration()->provenance()]);
    if ($path === '/api/records' || str_starts_with($path, '/api/records/')) recordRoute($path);
    $matrix = browserMatrix(FORM_SOURCE_ROOT);
    $alternatives = static fn(array $values): string => implode('|', array_map(static fn(string $value): string => preg_quote($value, '#'), $values));
    if (!preg_match('#^/api/(' . $alternatives($matrix->actions) . ')/(' . $alternatives($matrix->renderingPaths) . ')/(' . $alternatives($matrix->frameworks) . ')$#D', $path, $match)) respond(404, ['error' => 'Unknown endpoint']);
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
    $repo = new FormRepository(FORM_DATA_DIRECTORY . "/" . phpServerMode() . "-$renderingPath-$framework.json");
    if ($action === 'ssr') {
        $language = ssrLanguage($_SERVER['QUERY_STRING'] ?? '');
        $frameFile = FORM_PUBLIC_DIRECTORY . "/frames/$renderingPath-$framework/index.html";
        $frame = is_file($frameFile) ? file_get_contents($frameFile) : false;
        if (!is_string($frame)) respond(500, ['error' => FormGeneration::FRAME_ERROR]);
        $spec = FormJson::decode(file_get_contents(FORM_PUBLIC_DIRECTORY . '/spec.json'));
        $document = $generation->ssrFrame($frame, $spec, FormRepository::loadData($repo->read()), $language, FormJson::encode(...));
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
    $spec = FormJson::decode(file_get_contents(FORM_PUBLIC_DIRECTORY . '/spec.json'));
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
} catch (\CRUDUI\Validator\Validate\FormInputError $error) {
    respond(400, ['error' => $error->getMessage(), 'code' => $error->getErrorCode(), 'at' => '']);
} catch (InvalidArgumentException | JsonException | UnexpectedValueException | TypeError $error) {
    respond(400, ['error' => $error->getMessage()]);
} catch (Throwable $error) {
    respond(500, ['error' => $error->getMessage()]);
}
