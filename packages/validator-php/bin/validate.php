#!/usr/bin/env php
<?php

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use CRUDUI\Validator;
use CRUDUI\Validator\Compose\ComposeLoadError;

try {
    $request = json_decode(stream_get_contents(STDIN), false, 512, JSON_THROW_ON_ERROR);
    if (!$request instanceof stdClass || !property_exists($request, 'spec')) throw new InvalidArgumentException('Request must contain a spec object');
    if (!$request->spec instanceof stdClass) throw new InvalidArgumentException('Request spec must be an object');
    $mode = $request->mode ?? 'form';
    if (!in_array($mode, ['form', 'list'], true)) throw new InvalidArgumentException('Unsupported validation mode');
    $options = ['files'=>$request->files ?? [], 'basepath'=>$request->basepath ?? ''];
    $output = $mode === 'list' ? Validator::validateList($request->spec, $options) : Validator::validate($request->spec, property_exists($request, 'data') ? $request->data : [], $options);
} catch (ComposeLoadError $error) {
    $output = ['valid'=>false,'errors'=>[['path'=>'','field'=>'','rule'=>'compose','code'=>$error->getErrorCode(),'message'=>$error->getMessage(),'value'=>null]]];
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . "\n");
    exit(1);
}
echo json_encode($output, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
