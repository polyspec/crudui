#!/usr/bin/env php
<?php

declare(strict_types=1);
require __DIR__ . '/../vendor/autoload.php';
use CRUDUI\Form;
use CRUDUI\FormError;
use CRUDUI\Generator;
use CRUDUI\Validator\Compose\ComposeLoadError;

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
function required(stdClass $request, string $key): mixed
{
    if (!property_exists($request, $key)) {
        throw new InvalidArgumentException('Missing request property: ' . $key);
    }
    return $request->{$key};
}
function options(mixed $value): array
{
    if (!$value instanceof stdClass) {
        throw new InvalidArgumentException('Options must be an object');
    }
    return (array) $value;
}
try {
    $request = json_decode(stream_get_contents(STDIN), false, 512, JSON_THROW_ON_ERROR);
    if (!$request instanceof stdClass) {
        throw new InvalidArgumentException('Request must be an object');
    }
    switch ($request->operation ?? null) {
        case 'compileForm':
            $result = Generator::compileForm(required($request, 'spec'), options(property_exists($request, 'options') ? $request->options : new stdClass()));
            break;
        case 'bindForm':
            $result = Generator::bindForm(required($request, 'template'), property_exists($request, 'data') ? objectValue($request->data, 'Form data must be an object') : new stdClass(), options(property_exists($request, 'options') ? $request->options : new stdClass()));
            break;
        case 'renderList':
            // JSON decides each type before the library applies the PHP value rules.
            $spec = objectValue(required($request, 'spec'), 'List specification must be an object');
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
        case 'buildDetail':
        case 'renderDetail':
            $method = $request->operation;
            $spec = objectValue(required($request, 'spec'), 'Detail specification must be an object');
            $record = property_exists($request, 'record') ? objectValue($request->record, 'Detail record must be an object') : new stdClass();
            $detailOptions = options(property_exists($request, 'options') ? $request->options : new stdClass());
            // The context is checked after the fields, which the library checks first.
            if (property_exists($spec, 'fields') && isset($detailOptions['data'])) {
                objectValue($detailOptions['data'], 'Detail context must be an object');
            }
            $result = Generator::$method($spec, $record, $detailOptions);
            break;
        case 'form':
            $form = new Form(required($request, 'template'), property_exists($request, 'data') ? objectValue($request->data, 'Form data must be an object') : new stdClass(), options(property_exists($request, 'options') ? $request->options : new stdClass()));
            $steps = [];
            $actions = property_exists($request, 'actions') ? $request->actions : [];
            if (!is_array($actions)) {
                throw new InvalidArgumentException('Actions must be an array');
            }
            foreach ($actions as $action) {
                if (!$action instanceof stdClass) {
                    throw new InvalidArgumentException('Action must be an object');
                }
                $method = $action->method ?? '';
                $args = property_exists($action, 'args') ? $action->args : [];
                $value = null;
                $error = null;
                try {
                    if (!in_array($method, ['setData', 'setValue', 'addRow', 'copyRow', 'removeRow', 'moveRow', 'rekeyRow', 'getValue', 'getData'], true)) {
                        throw new InvalidArgumentException('Unknown form action: ' . $method);
                    }
                    if (!is_array($args)) {
                        throw new InvalidArgumentException('Action args must be an array');
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
            throw new InvalidArgumentException('Unknown generation operation');
    }
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n";
} catch (Throwable $error) {
    echo json_encode(['error' => failure($error)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n";
    exit(1);
}
