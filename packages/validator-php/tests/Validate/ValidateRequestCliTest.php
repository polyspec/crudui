<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Tests\Validate;

use PHPUnit\Framework\TestCase;

/**
 * PHP CRUDUI validate CLI — request-level rules shared by every validator CLI.
 *
 * The CLI checks a request in a fixed order before calling the library. Each
 * malformed request writes exactly {"error": MESSAGE} and exits 1:
 *  1. invalid JSON                     → "Request must be valid JSON"
 *  2. not a JSON object                → "Request must be an object"
 *  3. spec absent or not an object     → "Request spec must be an object"
 *  4. mode present and unsupported     → "Unsupported validation mode"
 *  5. files present, non-null, non-object → "Request files must be an object"
 *  6. a files member not an object     → "Request files must contain objects"
 *  7. basepath present, non-null, non-string → "Request basepath must be a string"
 * Form data is checked afterwards: a present non-object (null included) exits 2.
 */
final class ValidateRequestCliTest extends TestCase
{
    private const CLI = __DIR__ . '/../../bin/validate.php';
    private const PKG_ROOT = __DIR__ . '/../..';

    /** @return array{status: int, stdout: string, stderr: string} */
    private static function runCli(string $input): array
    {
        $cli = \realpath(self::CLI);
        self::assertNotFalse($cli, 'CLI not found: ' . self::CLI);
        $cwd = \realpath(self::PKG_ROOT);
        self::assertNotFalse($cwd);
        $proc = \proc_open([\PHP_BINARY, $cli], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, $cwd);
        self::assertIsResource($proc, 'proc_open failed');
        \fwrite($pipes[0], $input);
        \fclose($pipes[0]);
        $stdout = \stream_get_contents($pipes[1]);
        $stderr = \stream_get_contents($pipes[2]);
        \fclose($pipes[1]);
        \fclose($pipes[2]);
        return ['status' => \proc_close($proc), 'stdout' => $stdout === false ? '' : $stdout, 'stderr' => $stderr === false ? '' : $stderr];
    }

    /** @return array<string, array{0: string, 1: string}> */
    public static function malformedRequestProvider(): array
    {
        return [
            // 1. stdin is not valid JSON.
            'invalid json' => ['{"spec":', 'Request must be valid JSON'],
            'empty stdin' => ['', 'Request must be valid JSON'],
            'trailing garbage' => ['{"spec":{}} x', 'Request must be valid JSON'],
            // 2. the request is not a JSON object.
            'array request' => ['[]', 'Request must be an object'],
            'object list request' => ['[{"spec":{}}]', 'Request must be an object'],
            'string request' => ['"spec"', 'Request must be an object'],
            'number request' => ['1', 'Request must be an object'],
            'null request' => ['null', 'Request must be an object'],
            // 3. spec absent or not an object; checked before mode.
            'spec absent' => ['{}', 'Request spec must be an object'],
            'spec absent before bad mode' => ['{"mode":"grid"}', 'Request spec must be an object'],
            'spec null' => ['{"spec":null}', 'Request spec must be an object'],
            'spec array' => ['{"spec":[]}', 'Request spec must be an object'],
            'spec string' => ['{"spec":"x"}', 'Request spec must be an object'],
            // 4. mode present and not exactly form, list or detail; checked before files.
            'mode grid' => ['{"spec":{},"mode":"grid"}', 'Unsupported validation mode'],
            'mode null' => ['{"spec":{},"mode":null}', 'Unsupported validation mode'],
            'mode number' => ['{"spec":{},"mode":1}', 'Unsupported validation mode'],
            'mode uppercase' => ['{"spec":{},"mode":"FORM"}', 'Unsupported validation mode'],
            'mode before bad files' => ['{"spec":{},"mode":"grid","files":1}', 'Unsupported validation mode'],
            // 5. files present, not null and not an object; checked before basepath.
            'files array' => ['{"spec":{},"files":[]}', 'Request files must be an object'],
            'files string' => ['{"spec":{},"files":"a.yml"}', 'Request files must be an object'],
            'files false' => ['{"spec":{},"files":false}', 'Request files must be an object'],
            'files before bad basepath' => ['{"spec":{},"files":1,"basepath":1}', 'Request files must be an object'],
            // 6. a files member is not an object; checked before basepath.
            'files member array' => ['{"spec":{},"files":{"a.yml":[]}}', 'Request files must contain objects'],
            'files member null' => ['{"spec":{},"mode":"list","files":{"a.yml":{},"b.yml":null}}', 'Request files must contain objects'],
            'files member before bad basepath' => ['{"spec":{},"files":{"a.yml":"x"},"basepath":1}', 'Request files must contain objects'],
            // 7. basepath present, not null and not a string; checked before data.
            'basepath number' => ['{"spec":{},"basepath":1}', 'Request basepath must be a string'],
            'basepath object' => ['{"spec":{},"mode":"detail","basepath":{}}', 'Request basepath must be a string'],
            'basepath before bad data' => ['{"spec":{},"basepath":[],"data":[]}', 'Request basepath must be a string'],
        ];
    }

    /** @dataProvider malformedRequestProvider */
    public function testMalformedRequestWritesExactlyTheError(string $input, string $message): void
    {
        $run = self::runCli($input);
        self::assertSame(1, $run['status'], "malformed request exit should be 1; stderr: {$run['stderr']}");
        self::assertSame(\json_encode(['error' => $message]) . "\n", $run['stdout']);
    }

    /** @return array<string, array{0: string}> */
    public static function acceptedRequestProvider(): array
    {
        return [
            'files and basepath absent' => ['{"spec":{}}'],
            'files and basepath null' => ['{"spec":{},"files":null,"basepath":null}'],
            'empty files object' => ['{"spec":{},"files":{},"basepath":""}'],
            'files objects' => ['{"spec":{},"mode":"list","files":{"a.yml":{}},"basepath":"forms"}'],
            'detail ignores data' => ['{"spec":{},"mode":"detail","data":null}'],
        ];
    }

    /** @dataProvider acceptedRequestProvider */
    public function testWellFormedRequestValidates(string $input): void
    {
        $run = self::runCli($input);
        self::assertSame(0, $run['status'], "well-formed request exit should be 0; stdout: {$run['stdout']} stderr: {$run['stderr']}");
        self::assertSame('{"valid":true,"errors":[]}' . "\n", $run['stdout']);
    }

    /** @return array<string, array{0: string}> */
    public static function invalidFormDataProvider(): array
    {
        return [
            'data null' => ['{"spec":{},"data":null}'],
            'data array' => ['{"spec":{},"mode":"form","data":[]}'],
            'data string' => ['{"spec":{},"data":"x"}'],
        ];
    }

    /** @dataProvider invalidFormDataProvider */
    public function testFormDataRuleFollowsRequestRules(string $input): void
    {
        $run = self::runCli($input);
        self::assertSame(2, $run['status'], "invalid form data exit should be 2; stderr: {$run['stderr']}");
        self::assertSame('{"error":"Form data must be an object","code":"INVALID_FORM_INPUT","at":""}' . "\n", $run['stdout']);
    }
}
