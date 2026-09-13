#!/usr/bin/env php
<?php

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use CRUDUI\Validator;
use CRUDUI\Validator\Compose\ComposeLoadError;
use CRUDUI\Validator\Validate\FormInputError;

/*
 * Validation CLI. A result exits 0 with {valid, errors}. A load or input failure
 * exits 2 with {error, code, at}. A malformed request exits 1 with {error}.
 * An omitted data member validates {}; a supplied value must be a JSON object.
 */

function emit(array|stdClass $output, int $status): never
{
    echo json_encode($output, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), "\n";
    exit($status);
}

try {
    $request = json_decode(stream_get_contents(STDIN), false, 512, JSON_THROW_ON_ERROR);
    if (!$request instanceof stdClass || !property_exists($request, 'spec')) throw new InvalidArgumentException('Request must contain a spec object');
    if (!$request->spec instanceof stdClass) throw new InvalidArgumentException('Request spec must be an object');
    $mode = $request->mode ?? 'form';
    if (!in_array($mode, ['form', 'list'], true)) throw new InvalidArgumentException('Unsupported validation mode');
    $options = ['files' => $request->files ?? [], 'basepath' => $request->basepath ?? ''];
    if ($mode === 'list') {
        $output = Validator::validateList($request->spec, $options);
    } else {
        $data = property_exists($request, 'data') ? $request->data : new stdClass();
        if (!$data instanceof stdClass) throw new FormInputError('Form data must be an object');
        $output = Validator::validate($request->spec, $data, $options);
    }
} catch (ComposeLoadError $error) {
    emit(['error' => $error->getMessage(), 'code' => $error->getErrorCode(), 'at' => implode('.', $error->getCompositionTrace())], 2);
} catch (FormInputError $error) {
    emit(['error' => $error->getMessage(), 'code' => $error->getErrorCode(), 'at' => ''], 2);
} catch (Throwable $error) {
    emit(['error' => $error->getMessage()], 1);
}
emit($output, 0);
