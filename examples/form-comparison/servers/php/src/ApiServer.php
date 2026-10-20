<?php

declare(strict_types=1);

namespace Polyspec\Crudui\FormComparison;

use InvalidArgumentException;
use JsonException;
use LengthException;
use RuntimeException;
use stdClass;
use Throwable;
use TypeError;
use UnexpectedValueException;

/**
 * The PHP record server of the form comparison (docs/operations/form-comparison.md, "Record servers"): servers/php/api.php
 * answers each request of PHP-FPM through one instance.
 */
final class ApiServer
{
    /**
     * @param string $sourceRoot The checkout that holds the comparison and the CRUDUI sources.
     * @param string $publicDirectory The public directory of the running build.
     * @param string $dataDirectory The data directory of the stored records.
     */
    public function __construct(
        private readonly string $sourceRoot,
        private readonly string $publicDirectory,
        private readonly string $dataDirectory,
    ) {
    }

    /** Return a JSON response and finish the request. The record resource names only the server. */
    private function respond(int $status, array $body, bool $records = false): never
    {
        // The PHP extension process answers only while it runs no class of the PHP library.
        if (ServerMode::current() === 'php-ext') {
            try {
                FormGeneration::assertNativeClasses();
            } catch (RuntimeException $error) {
                [$status, $body] = [500, ['error' => $error->getMessage()]];
            }
        }
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        $server = ['server' => ServerMode::current()];
        echo FormJson::encode(
            $records
                ? [...$body, ...$server]
                : [...$body, ...$server, 'nativeJson' => extension_loaded('ordered_json')]
        );
        exit;
    }

    /** Return one absolute directory named by an environment variable. */
    public static function environmentDirectory(string $name): string
    {
        $directory = getenv($name);
        if (!is_string($directory) || !str_starts_with($directory, '/') || !is_dir($directory)) {
            throw new RuntimeException("$name must name an absolute directory");
        }
        return rtrim($directory, '/');
    }

    /** Open the current library with the source identity published for the running build. */
    private function currentGeneration(): FormGeneration
    {
        $raw = file_get_contents($this->publicDirectory . '/source.json');
        $source = is_string($raw) ? FormJson::decode($raw) : null;
        if (!$source instanceof stdClass) {
            throw new RuntimeException('Missing source identity');
        }
        $moduleSha256 = getenv('FORM_CRUDUI_MODULE_SHA256');
        return new FormGeneration(
            ServerMode::current(),
            $this->sourceRoot,
            $source,
            $moduleSha256 === false ? null : $moduleSha256,
        );
    }

    /** Decode one JSON object request within the HTTP size limit. */
    /** The `form` member of a JSON submission, which holds exactly that member. */
    private function jsonForm(): mixed
    {
        $request = $this->jsonRequest();
        if (array_keys(get_object_vars($request)) !== ['form']) {
            throw new InvalidArgumentException('Expected a request object with exactly form');
        }
        return $request->form;
    }

    private function jsonRequest(): stdClass
    {
        $request = FormJson::decode(RequestBody::read());
        if (!$request instanceof stdClass) {
            throw new InvalidArgumentException('Expected request object');
        }
        return $request;
    }

    /**
     * Return the SSR frame language after requiring exactly lang, server and initialization once each.
      * The query is parsed as application/x-www-form-urlencoded: empty parts are ignored and a part without "=" has an
      * empty value.
     */
    private function ssrLanguage(string $query): string
    {
        $parameters = [];
        foreach (explode('&', $query) as $pair) {
            if ($pair === '') {
                continue;
            }
            [$name, $value] = array_pad(explode('=', $pair, 2), 2, '');
            $name = urldecode($name);
            if (array_key_exists($name, $parameters)) {
                $this->respond(400, ['error' => 'Expected lang, server and initialization for this SSR frame']);
            }
            $parameters[$name] = urldecode($value);
        }
        ksort($parameters);
        $language = $parameters['lang'] ?? null;
        if (
            array_keys($parameters) !== ['initialization', 'lang', 'server'] || !in_array($language, ['ko', 'en'], true)
            || $parameters['server'] !== ServerMode::current() || $parameters['initialization'] !== 'ssr'
        ) {
            $this->respond(400, ['error' => 'Expected lang, server and initialization for this SSR frame']);
        }
        return $language;
    }

    /** Answer one record failure. */
    private function recordFailure(int $status, string $message): never
    {
        $this->respond($status, ['error' => $message], true);
    }

    /**
     * Split an application/x-www-form-urlencoded query into its name and value pairs in order;
     * empty parts are ignored and a part without "=" has an empty value.
     */
    private function queryPairs(string $query): array
    {
        $pairs = [];
        foreach (explode('&', $query) as $part) {
            if ($part === '') {
                continue;
            }
            [$name, $value] = array_pad(explode('=', $part, 2), 2, '');
            $pairs[] = [urldecode($name), urldecode($value)];
        }
        return $pairs;
    }

    /** Return a decimal integer from 1 without sign or leading zero, or null. */
    private function positiveInteger(string $text): ?int
    {
        return preg_match('/^[1-9][0-9]{0,8}$/D', $text) ? (int) $text : null;
    }

    /** The media type of the request, without parameters. */
    private function requestMediaType(): string
    {
        return strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
    }

    /** Whether the request carries a body. */
    private function requestHasBody(): bool
    {
        return (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0 || RequestBody::read() !== '';
    }

    /**
     * The `form` fields of a native save or validation request: exactly `form[…]` and
     * `_form_complete=1`, each name once; a request without `form` fields submits no members.
     */
    private function nativeForm(): array
    {
        $fields = RequestBody::fields($_SERVER['CONTENT_TYPE'] ?? '', RequestBody::read());
        if (($fields['_form_complete'] ?? null) !== '1') {
            throw new InvalidArgumentException('Incomplete native form submission');
        }
        unset($fields['_form_complete']);
        if (array_diff(array_keys($fields), ['form']) !== []) {
            throw new InvalidArgumentException('Expected exactly the form fields');
        }
        return $fields['form'] ?? [];
    }

    /** The customer specifications with the selection query appended to the list and detail links. */
    private function stageSpecs(string $selection): stdClass
    {
        $specs = FormJson::decode((string) file_get_contents($this->publicDirectory . '/customer-specs.json'));
        $specs->list->columns->name->format->href .= '&' . $selection;
        $specs->detail->fields->id->format->href .= '&' . $selection;
        return $specs;
    }

    /**
     * Parse the query of one view request: `id` for detail and form, then exactly lang, server,
     * framework, initialization, mode and page, each once and in that order.
     */
    private function viewQuery(string $view): array
    {
        $names = [...($view === 'list' ? [] : ['id']), 'lang', 'server', 'framework', 'initialization', 'mode', 'page'];
        $pairs = $this->queryPairs($_SERVER['QUERY_STRING'] ?? '');
        if (array_column($pairs, 0) !== $names) {
            $this->recordFailure(400, 'Expected ' . implode(', ', $names));
        }
        $query = array_combine($names, array_column($pairs, 1));
        $allowed = [
            'lang' => ['ko', 'en'],
            'server' => [ServerMode::current()],
            'framework' => ['html', 'react', 'vue', 'svelte'],
            'initialization' => ['ssr'], 'mode' => ['bindForm', 'createForm'],
        ];
        foreach ($allowed as $name => $values) {
            if (!in_array($query[$name], $values, true)) {
                $this->recordFailure(400, "Unexpected $name");
            }
        }
        $page = $this->positiveInteger($query['page']);
        if ($page === null) {
            $this->recordFailure(400, 'Unexpected page');
        }
        if ($view !== 'list' && $this->positiveInteger($query['id']) === null) {
            $this->recordFailure(400, 'Unexpected id');
        }
        return [...$query, 'page' => $page];
    }

    /** Render one SSR stage of the record flow. */
    private function recordView(RecordStore $store, string $view): never
    {
        if (!in_array($view, ['list', 'detail', 'form'], true)) {
            $this->recordFailure(404, 'View not found');
        }
        $query = $this->viewQuery($view);
        $selection = implode('&', array_map(
            static fn(string $name): string => $name . '=' . rawurlencode((string) $query[$name]),
            ['lang', 'server', 'framework', 'initialization', 'mode', 'page'],
        ));
        $records = $store->read();
        $language = $query['lang'];
        $specs = $this->stageSpecs($selection);
        if ($view === 'list') {
            $rows = RecordStore::page($records, $query['page']);
            if ($rows === null) {
                $this->recordFailure(404, 'Page not found');
            }
            $html = \Polyspec\Crudui\Generator::renderList($specs->list, $rows, [
                'language' => $language,
                'layout' => 'table',
                'page' => $query['page'],
                'total' => count($records),
            ]);
            $data = [
                'page' => $query['page'],
                'perPage' => RecordStore::PER_PAGE,
                'total' => count($records),
                'records' => $rows,
            ];
        } else {
            $record = RecordStore::find($records, $query['id']);
            if ($record === null) {
                $this->recordFailure(404, 'Record not found');
            }
            if ($view === 'detail') {
                $html = \Polyspec\Crudui\Generator::renderDetail($specs->detail, $record, ['language' => $language]);
            } else {
                $template = \Polyspec\Crudui\Generator::compileForm($specs->form, ['keyPrefix' => 'form']);
                $form = new \Polyspec\Crudui\Form($template, RecordStore::formData($record), ['language' => $language]);
                $html = '<form id="record-form" method="post" '
                    . 'action="/api/' . $query['server'] . '/records/' . $record->id . '" '
                    . 'enctype="multipart/form-data">' . \Polyspec\Crudui\Generator::renderForm($form) . '</form>';
            }
            $data = ['record' => $record];
        }
        $this->respond(200, ['view' => $view, 'html' => $html, 'data' => $data], true);
    }

    /** Read the submitted form of a native or JSON save request, answering 400 or 413 for a request it cannot take. */
    private function recordSubmission(): stdClass
    {
        if ($this->requestMediaType() === 'application/json') {
            return RecordStore::submission($this->jsonForm(), false);
        }
        return RecordStore::submission($this->nativeForm(), true);
    }

    /** Answer one request of the record resource (docs/operations/form-comparison.md, "Record resource"). */
    private function recordRoute(string $path): never
    {
        try {
            // Opening the generation loads and verifies the selected CRUDUI implementation.
            $this->currentGeneration();
            $method = $_SERVER['REQUEST_METHOD'] ?? '';
            $store = new RecordStore(
                $this->dataDirectory . '/records-' . ServerMode::current() . '.json',
                $this->publicDirectory . '/customer-records.json'
            );
            if ($path === '/api/records') {
                if ($method !== 'GET') {
                    $this->recordFailure(405, 'Method not allowed');
                }
                $pairs = $this->queryPairs($_SERVER['QUERY_STRING'] ?? '');
                $page = count($pairs) === 1 && $pairs[0][0] === 'page' ? $this->positiveInteger($pairs[0][1]) : null;
                if ($page === null) {
                    $this->recordFailure(400, 'Expected one page parameter');
                }
                $records = $store->read();
                $rows = RecordStore::page($records, $page);
                if ($rows === null) {
                    $this->recordFailure(404, 'Page not found');
                }
                $this->respond(200, [
                    'page' => $page,
                    'perPage' => RecordStore::PER_PAGE,
                    'total' => count($records),
                    'records' => $rows,
                ], true);
            }
            if (preg_match('#^/api/records/view/([^/]+)$#D', $path, $match)) {
                if ($method !== 'GET') {
                    $this->recordFailure(405, 'Method not allowed');
                }
                $this->recordView($store, $match[1]);
            }
            if ($path === '/api/records/reset') {
                if ($method !== 'POST') {
                    $this->recordFailure(405, 'Method not allowed');
                }
                if ($this->requestHasBody()) {
                    $this->recordFailure(400, 'Reset takes no request body');
                }
                $this->respond(200, ['total' => $store->reset()], true);
            }
            if (!preg_match('#^/api/records/([^/]+)$#D', $path, $match)) {
                $this->recordFailure(404, 'Unknown endpoint');
            }
            $id = $match[1];
            if ($method === 'GET') {
                $record = RecordStore::find($store->read(), $id);
                if ($record === null) {
                    $this->recordFailure(404, 'Record not found');
                }
                $this->respond(200, ['record' => $record], true);
            }
            if ($method !== 'POST') {
                $this->recordFailure(405, 'Method not allowed');
            }
            if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 2 * 1024 * 1024) {
                $this->recordFailure(413, 'Request exceeds 2 MiB');
            }
            $type = $this->requestMediaType();
            $accepted = ['multipart/form-data', 'application/x-www-form-urlencoded', 'application/json'];
            if (!in_array($type, $accepted, true)) {
                $this->recordFailure(415, 'Expected a native form or JSON');
            }
            if (RecordStore::find($store->read(), $id) === null) {
                $this->recordFailure(404, 'Record not found');
            }
            $submitted = $this->recordSubmission();
            if ($submitted->id !== $id) {
                $this->recordFailure(400, 'The submitted id differs from the path id');
            }
            $specs = FormJson::decode((string) file_get_contents($this->publicDirectory . '/customer-specs.json'));
            $validation = \Polyspec\Crudui\Validator::validate($specs->form, $submitted);
            if ($validation->valid !== true) {
                $this->respond(422, ['validation' => $validation], true);
            }
            $record = $store->save($id, $submitted);
            if ($record === null) {
                $this->recordFailure(404, 'Record not found');
            }
            $this->respond(200, ['record' => $record, 'validation' => $validation], true);
        } catch (LengthException $error) {
            $this->recordFailure(413, $error->getMessage());
        } catch (
            InvalidArgumentException | JsonException | UnexpectedValueException | \Polyspec\Crudui\FormError $error
        ) {
            $this->recordFailure(400, $error->getMessage());
        } catch (Throwable $error) {
            $this->recordFailure(500, $error->getMessage());
        }
    }

    /** Answer the request of one API path. */
    public function handle(string $path): never
    {
        try {
            if ($path === '/api/health') {
                $this->respond(200, [
                    'status' => 'ok',
                    'php' => PHP_VERSION,
                    'storage' => 'JSON files',
                    'jsonProcessor' => 'ordered-json',
                    'generator' => $this->currentGeneration()->provenance(),
                ]);
            }
            if ($path === '/api/records' || str_starts_with($path, '/api/records/')) {
                $this->recordRoute($path);
            }
            $matrix = BrowserMatrix::read($this->sourceRoot);
            $alternatives = static fn(array $values): string => implode(
                '|',
                array_map(static fn(string $value): string => preg_quote($value, '#'), $values)
            );
            $route = '#^/api/(' . $alternatives($matrix->actions)
                . ')/(' . $alternatives($matrix->renderingPaths) . ')/('
                . $alternatives($matrix->frameworks) . ')$#D';
            if (!preg_match($route, $path, $match)) {
                $this->respond(404, ['error' => 'Unknown endpoint']);
            }
            [, $action, $renderingPath, $framework] = $match;
            $expectedMethod = in_array($action, ['load', 'ssr'], true) ? 'GET' : 'POST';
            if ($_SERVER['REQUEST_METHOD'] !== $expectedMethod) {
                $this->respond(405, ['error' => 'Method not allowed']);
            }
            if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 2 * 1024 * 1024) {
                $this->respond(413, ['error' => 'Request exceeds 2 MiB']);
            }
            $contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
            $generation = $this->currentGeneration();
            if ($action === 'compile' || $action === 'render') {
                if ($contentType !== 'application/json') {
                    $this->respond(415, ['error' => 'Expected a JSON request']);
                }
                $this->respond(200, $generation->$action($this->jsonRequest()));
            }
            if (
                $action === 'reset'
                && !in_array($contentType, ['multipart/form-data', 'application/x-www-form-urlencoded'], true)
            ) {
                $this->respond(415, ['error' => 'Expected a native form']);
            }
            $repo = new FormRepository(
                $this->dataDirectory . "/" . ServerMode::current() . "-$renderingPath-$framework.json"
            );
            if ($action === 'ssr') {
                $language = $this->ssrLanguage($_SERVER['QUERY_STRING'] ?? '');
                $frameFile = $this->publicDirectory . "/frames/$renderingPath-$framework/index.html";
                $frame = is_file($frameFile) ? file_get_contents($frameFile) : false;
                if (!is_string($frame)) {
                    $this->respond(500, ['error' => FormGeneration::FRAME_ERROR]);
                }
                $spec = FormJson::decode(file_get_contents($this->publicDirectory . '/spec.json'));
                $document = $generation->ssrFrame(
                    $frame,
                    $spec,
                    FormRepository::loadData($repo->read()),
                    $language,
                    FormJson::encode(...)
                );
                if (ServerMode::current() === 'php-ext') {
                    FormGeneration::assertNativeClasses();
                }
                header('Content-Type: text/html; charset=utf-8');
                header('Cache-Control: no-store');
                echo $document;
                exit;
            }
            if ($action === 'reset' || $action === 'load') {
                if ($action === 'reset') {
                    $fields = RequestBody::fields($_SERVER['CONTENT_TYPE'] ?? '', RequestBody::read());
                    $fixture = $fields['fixture'] ?? 'default';
                    if (!is_string($fixture)) {
                        $this->respond(400, ['error' => 'Expected fixture name']);
                    }
                }
                $state = $action === 'reset' ? $repo->reset($fixture) : $repo->read();
                $this->respond(200, [
                    'storage' => $state,
                    'data' => FormRepository::loadData($state),
                    'generator' => $generation->provenance(),
                ]);
            }
            $spec = FormJson::decode(file_get_contents($this->publicDirectory . '/spec.json'));
            if ($contentType === 'application/json') {
                $native = false;
                $received = $this->jsonForm();
            } elseif (in_array($contentType, ['multipart/form-data', 'application/x-www-form-urlencoded'], true)) {
                $native = true;
                $received = $this->nativeForm();
            } else {
                $this->respond(415, ['error' => 'Expected a form or JSON request']);
            }
            $normalized = FormRepository::submission($received, $native);
            $validation = (array) \Polyspec\Crudui\Validator::validate($spec, $normalized);
            $result = [
                'transport' => $contentType,
                'jsonProcessor' => 'ordered-json',
                'validatorSource' => 'current',
                'received' => $received,
                'normalized' => $normalized,
                'validation' => $validation,
                'generator' => $generation->provenance(),
            ];
            if ($action === 'validate') {
                $this->respond(200, $result);
            }
            if (!$validation['valid']) {
                $this->respond(422, $result);
            }
            $this->respond(200, [...$result, ...$repo->save(FormJson::arrays($normalized))]);
        } catch (LengthException $error) {
            $this->respond(413, ['error' => $error->getMessage()]);
        } catch (\Polyspec\Crudui\FormError $error) {
            $this->respond(
                400,
                ['error' => $error->getMessage(), 'code' => $error->getErrorCode(), 'at' => $error->getPath()]
            );
        } catch (\Polyspec\Crudui\Validator\Compose\ComposeLoadError $error) {
            $this->respond(400, [
                'error' => $error->getMessage(),
                'code' => $error->getErrorCode(),
                'trace' => $error->getCompositionTrace(),
            ]);
        } catch (\Polyspec\Crudui\Validator\Validate\FormInputError $error) {
            $this->respond(400, ['error' => $error->getMessage(), 'code' => $error->getErrorCode(), 'at' => '']);
        } catch (InvalidArgumentException | JsonException | UnexpectedValueException | TypeError $error) {
            $this->respond(400, ['error' => $error->getMessage()]);
        } catch (Throwable $error) {
            $this->respond(500, ['error' => $error->getMessage()]);
        }
    }
}
