<?php

declare(strict_types=1);

namespace CRUDUI\Generator\Tests;

use PHPUnit\Framework\TestCase;
use CRUDUI\Generator;

final class GenerateCliTest extends TestCase
{
    private static function invoke(array $request): array
    {
        $process = proc_open([PHP_BINARY, __DIR__ . '/../bin/generate.php'], [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']], $pipes);
        self::assertIsResource($process);
        fwrite($pipes[0], json_encode($request, JSON_THROW_ON_ERROR));
        fclose($pipes[0]);
        $output = stream_get_contents($pipes[1]);
        $error = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $status = proc_close($process);
        self::assertSame('', $error);
        return [$status, json_decode($output, false, 512, JSON_THROW_ON_ERROR)];
    }

    public function testJsonRecordsDoNotAcceptArraysOrNull(): void
    {
        $template = Generator::compileForm(json_decode('{"type":"group","properties":{}}'));
        foreach ([['data' => []], ['data' => null], ['options' => null], ['actions' => null], ['actions' => [null]]] as $invalid) {
            [$status, $result] = self::invoke(['operation' => 'form', 'template' => $template, ...$invalid]);
            self::assertSame(1, $status);
            self::assertSame('INVALID_FORM_INPUT', $result->error->code);
        }
    }

    public function testMissingRequiredRequestPropertiesProduceOneJsonError(): void
    {
        foreach (['compileForm', 'bindForm', 'form', 'renderList'] as $operation) {
            [$status, $result] = self::invoke(['operation' => $operation]);
            self::assertSame(1, $status);
            self::assertSame('INVALID_FORM_INPUT', $result->error->code);
        }
    }

    public function testJsonDecidesListAndDetailInputTypes(): void
    {
        $spec = json_decode('{"columns":{"v":{"field":".v","label":"V"}}}');
        $detail = json_decode('{"fields":{"v":{"field":".v"}}}');
        $invalid = fn (string $message) => (object) ['code' => 'INVALID_FORM_INPUT', 'message' => $message, 'at' => ''];
        foreach ([
            [['operation' => 'renderList', 'spec' => [], 'rows' => []], 'List specification must be an object'],
            [['operation' => 'renderList', 'spec' => 'list', 'rows' => []], 'List specification must be an object'],
            [['operation' => 'renderList', 'spec' => $spec, 'rows' => new \stdClass()], 'List rows must be an array'],
            [['operation' => 'renderList', 'spec' => $spec, 'rows' => [1]], 'List rows must be objects'],
            [['operation' => 'renderList', 'spec' => $spec, 'rows' => [[]]], 'List rows must be objects'],
            [['operation' => 'renderList', 'spec' => $spec, 'rows' => [], 'options' => ['data' => []]], 'List context must be an object'],
            [['operation' => 'renderList', 'spec' => $spec, 'rows' => [], 'options' => ['pageMeta' => []]], 'List page metadata must be an object'],
            [['operation' => 'renderList', 'spec' => $spec, 'rows' => [], 'options' => ['layout' => 'grid']], 'List layout must be table or card'],
            [['operation' => 'renderList', 'spec' => $spec, 'rows' => [], 'options' => ['layout' => 5]], 'List layout must be table or card'],
            [['operation' => 'renderDetail', 'spec' => $detail, 'record' => new \stdClass(), 'options' => ['data' => []]], 'Detail context must be an object'],
            [['operation' => 'buildDetail', 'spec' => new \stdClass(), 'record' => new \stdClass(), 'options' => ['data' => []]], 'Detail specification must declare fields'],
        ] as [$request, $message]) {
            [$status, $result] = self::invoke($request);
            self::assertSame(1, $status, $message);
            self::assertEquals($invalid($message), $result->error);
        }
        foreach ([['data' => null], ['layout' => null], ['pageMeta' => null]] as $options) {
            [$status, $result] = self::invoke(['operation' => 'renderList', 'spec' => $spec, 'rows' => [['v' => 'a']], 'options' => $options]);
            self::assertSame(0, $status);
            self::assertStringContainsString('<table class="list-table">', $result);
        }
        [$status, $result] = self::invoke(['operation' => 'renderDetail', 'spec' => $detail, 'record' => new \stdClass(), 'options' => ['data' => null]]);
        self::assertSame(0, $status);
        self::assertStringStartsWith('<dl class="detail-view">', $result);
    }

    public function testFailedActionKeepsCompleteStateAndLaterActionRuns(): void
    {
        $template = Generator::compileForm(json_decode('{"type":"group","properties":{"name":{"type":"text"}}}'));
        [$status, $result] = self::invoke(['operation' => 'form', 'template' => $template, 'data' => (object) ['name' => 'Ada'], 'actions' => [['method' => 'setData', 'args' => [[]]], ['method' => 'setValue', 'args' => ['name', 'Grace']]]]);
        self::assertSame(0, $status);
        self::assertSame('INVALID_FORM_INPUT', $result->steps[0]->error->code);
        self::assertSame(0, $result->steps[0]->revision);
        self::assertSame('Ada', $result->steps[0]->data->name);
        [$initialStatus, $initial] = self::invoke(['operation' => 'form', 'template' => $template, 'data' => (object) ['name' => 'Ada']]);
        self::assertSame(0, $initialStatus);
        self::assertSame(json_encode($initial->fields), json_encode($result->steps[0]->fields));
        self::assertSame($initial->html, $result->steps[0]->html);
        self::assertNull($result->steps[1]->error);
        self::assertSame('Grace', $result->data->name);
        self::assertSame(1, $result->revision);
    }
}
