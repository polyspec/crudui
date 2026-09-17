<?php

declare(strict_types=1);

require __DIR__ . '/../../../../packages/generator-php/vendor/autoload.php';

use CRUDUI\Form;
use CRUDUI\FormError;
use CRUDUI\Generator;
use CRUDUI\Validator\Compose\ComposeLoadError;

/*
 * PHP generator process of the native generator conformance suite. It reads one JSON
 * request on standard input, calls the public API of crudui/generator and writes one
 * JSON value on standard output; ../../README.md defines the protocol. With the native
 * extension loaded, the same program runs the extension's classes.
 */

function failure(Throwable $error): array
{
    return ['code' => $error instanceof ComposeLoadError || $error instanceof FormError ? $error->getErrorCode() : 'INVALID_FORM_INPUT', 'message' => $error->getMessage(), 'at' => $error instanceof FormError ? $error->getPath() : ($error instanceof ComposeLoadError ? implode('.', $error->getCompositionTrace()) : '')];
}
function state(Form $form): array
{
    return ['data' => $form->getData(), 'fields' => $form->getFields(), 'html' => Generator::renderForm($form), 'revision' => $form->getRevision()];
}
/** A protocol JSON object; a JSON array or scalar is not an object in any runtime. */
function objectValue(mixed $value, string $message): stdClass
{
    if (!$value instanceof stdClass) {
        throw new InvalidArgumentException($message);
    }
    return $value;
}
/** The request member, or null when it is absent. */
function member(stdClass $request, string $key): mixed
{
    return property_exists($request, $key) ? $request->{$key} : null;
}
/** A form template is a JSON object; the library checks its kind. */
function template(stdClass $request): stdClass
{
    return objectValue(member($request, 'template'), 'Unsupported form template');
}
function options(mixed $value): array
{
    if (!$value instanceof stdClass) {
        throw new InvalidArgumentException('Options must be an object');
    }
    return (array) $value;
}
try {
    try {
        $request = json_decode(stream_get_contents(STDIN), false, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        throw new InvalidArgumentException('Request must be valid JSON');
    }
    if (!$request instanceof stdClass) {
        throw new InvalidArgumentException('Request must be an object');
    }
    switch ($request->operation ?? null) {
        case 'compileForm':
            $result = Generator::compileForm(objectValue(member($request, 'spec'), 'A form spec must be a group with properties'), options(property_exists($request, 'options') ? $request->options : new stdClass()));
            break;
        case 'bindForm':
            $result = Generator::bindForm(template($request), property_exists($request, 'data') ? objectValue($request->data, 'Form data must be an object') : new stdClass(), options(property_exists($request, 'options') ? $request->options : new stdClass()));
            break;
        case 'bindButtons':
            $result = Generator::bindButtons(template($request), property_exists($request, 'data') ? objectValue($request->data, 'Form data must be an object') : new stdClass(), options(property_exists($request, 'options') ? $request->options : new stdClass()));
            break;
        case 'formButtonsHtml':
            $buttons = member($request, 'buttons');
            if (!is_array($buttons)) {
                throw new InvalidArgumentException('Form buttons must be a list');
            }
            $result = Generator::formButtonsHtml($buttons);
            break;
        case 'renderList':
            // JSON decides each type before the library applies the PHP value rules.
            $spec = objectValue(member($request, 'spec'), 'List specification must be an object');
            $rows = property_exists($request, 'rows') ? $request->rows : [];
            if (!is_array($rows)) {
                throw new InvalidArgumentException('List rows must be an array');
            }
            foreach ($rows as $row) {
                objectValue($row, 'List rows must be objects');
            }
            $listOptions = options(property_exists($request, 'options') ? $request->options : new stdClass());
            if (isset($listOptions['data'])) {
                objectValue($listOptions['data'], 'List context must be an object');
            }
            $result = Generator::renderList($spec, $rows, $listOptions);
            break;
        case 'buildList':
            $spec = objectValue(member($request, 'spec'), 'List specification must be an object');
            $rows = property_exists($request, 'rows') ? $request->rows : [];
            if (!is_array($rows)) {
                throw new InvalidArgumentException('List rows must be an array');
            }
            foreach ($rows as $row) {
                objectValue($row, 'List rows must be objects');
            }
            $listOptions = options(property_exists($request, 'options') ? $request->options : new stdClass());
            if (isset($listOptions['data'])) {
                objectValue($listOptions['data'], 'List context must be an object');
            }
            $result = Generator::buildList($spec, $rows, $listOptions);
            break;
        case 'buildDetail':
        case 'renderDetail':
            $method = $request->operation;
            $spec = objectValue(member($request, 'spec'), 'Detail specification must be an object');
            $record = property_exists($request, 'record') ? objectValue($request->record, 'Detail record must be an object') : new stdClass();
            $detailOptions = options(property_exists($request, 'options') ? $request->options : new stdClass());
            // The context is checked after the fields, which the library checks first.
            if (property_exists($spec, 'fields') && isset($detailOptions['data'])) {
                objectValue($detailOptions['data'], 'Detail context must be an object');
            }
            $result = Generator::$method($spec, $record, $detailOptions);
            break;
        case 'form':
            $form = new Form(template($request), property_exists($request, 'data') ? objectValue($request->data, 'Form data must be an object') : new stdClass(), options(property_exists($request, 'options') ? $request->options : new stdClass()));
            $steps = [];
            $actions = property_exists($request, 'actions') ? $request->actions : [];
            if (!is_array($actions)) {
                throw new InvalidArgumentException('Actions must be an array');
            }
            foreach ($actions as $action) {
                $value = null;
                $error = null;
                try {
                    $method = $action instanceof stdClass ? ($action->method ?? null) : null;
                    $args = $action instanceof stdClass && property_exists($action, 'args') ? $action->args : null;
                    if (!in_array($method, ['setData', 'setValue', 'addRow', 'copyRow', 'removeRow', 'moveRow', 'rekeyRow', 'getValue', 'getData'], true) || !is_array($args)) {
                        throw new InvalidArgumentException('Invalid form action');
                    }
                    if ($method === 'setData' && array_key_exists(0, $args)) {
                        $args[0] = objectValue($args[0], 'Form data must be an object');
                    }
                    $optionIndex = $method === 'addRow' ? 1 : ($method === 'copyRow' ? 2 : null);
                    if ($optionIndex !== null && array_key_exists($optionIndex, $args)) {
                        $args[$optionIndex] = options($args[$optionIndex]);
                    }
                    $value = $form->{$method}(...$args);
                } catch (Throwable $caught) {
                    $error = failure($caught);
                }
                $steps[] = ['result' => $value, 'error' => $error, ...state($form)];
            }
            $result = [...state($form), 'steps' => $steps];
            break;
        default:
            throw new InvalidArgumentException('Unknown generator operation');
    }
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n";
} catch (Throwable $error) {
    echo json_encode(['error' => failure($error)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n";
    exit(1);
}
