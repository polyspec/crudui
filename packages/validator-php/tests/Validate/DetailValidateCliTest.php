<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Tests\Validate;

use PHPUnit\Framework\TestCase;

/**
 * PHP CRUDUI validate CLI — detail mode and the shared mode rule.
 *
 * The detail engine is pinned by DetailValidateConformanceTest. This test owns
 * the CLI boundary: mode "detail" routes to validateDetail and ignores data, an
 * absent mode is "form", and any other mode value, including a non-string, is a
 * malformed request that exits 1 with {"error":"Unsupported validation mode"}.
 *
 * The shared fixture tests/fixtures/detail-validity/cases.json is the truth via
 * its `engine` field:
 *  - engine:"pass"       → {valid:true, errors:[]} (exit 0).
 *  - engine:{code, at}   → exit 2, stdout exactly {error, code, at}.
 */
final class DetailValidateCliTest extends TestCase
{
    private const SHARED_FIXTURE = __DIR__ . '/../../../../tests/fixtures/detail-validity/cases.json';
    private const CLI = __DIR__ . '/../../bin/validate.php';
    private const PKG_ROOT = __DIR__ . '/../..';

    /** @return array<string, array{0: \stdClass}> */
    public static function fixtureProvider(): array
    {
        $path = \realpath(self::SHARED_FIXTURE);
        self::assertNotFalse($path, 'shared detail-validity fixture not found: ' . self::SHARED_FIXTURE);
        $raw = \file_get_contents($path);
        self::assertNotFalse($raw);
        $out = [];
        foreach (\json_decode($raw, false, 512, JSON_THROW_ON_ERROR) as $case) {
            $out[$case->name] = [$case];
        }
        return $out;
    }

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

    /** @return array<string, mixed>|null */
    private static function decode(string $stdout): ?array
    {
        $out = \json_decode(\trim($stdout), true);
        return \is_array($out) ? $out : null;
    }

    /** @dataProvider fixtureProvider */
    public function testDetailCliBoundary(\stdClass $case): void
    {
        // Data that is not an object would fail form mode; detail mode ignores it.
        $request = ['mode' => 'detail', 'spec' => $case->spec, 'files' => $case->files ?? new \stdClass(), 'data' => [1]];
        $run = self::runCli(\json_encode($request, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
        $out = self::decode($run['stdout']);
        self::assertIsArray($out, "non-JSON stdout: {$run['stdout']}");

        if ($case->engine === 'pass') {
            self::assertSame(0, $run['status'], "clean detail exit should be 0; stderr: {$run['stderr']}");
            self::assertSame(['valid' => true, 'errors' => []], $out, "case {$case->name} should load clean");
            return;
        }

        self::assertSame(2, $run['status'], "detail load failure exit should be 2; stderr: {$run['stderr']}");
        self::assertSame(['error', 'code', 'at'], \array_keys($out), 'failure stdout must carry exactly {error, code, at}');
        self::assertIsString($out['error']);
        self::assertNotSame('', $out['error'], "case {$case->name} failure must carry a message");
        self::assertSame($case->engine->code, $out['code'], "failure code mismatch for {$case->name}");
        self::assertSame($case->engine->at, $out['at'], "failure location mismatch for {$case->name}");
    }

    /** @return array<string, array{0: mixed}> */
    public static function unsupportedModeProvider(): array
    {
        return [
            'unknown string' => ['grid'],
            'search' => ['search'],
            'empty string' => [''],
            'case differs' => ['Detail'],
            'null' => [null],
            'number' => [1],
            'boolean' => [true],
            'array' => [['detail']],
            'object' => [['mode' => 'detail']],
        ];
    }

    /** @dataProvider unsupportedModeProvider */
    public function testUnsupportedModeIsMalformedRequest(mixed $mode): void
    {
        $run = self::runCli(\json_encode(['mode' => $mode, 'spec' => new \stdClass()], JSON_THROW_ON_ERROR));
        self::assertSame(1, $run['status'], "unsupported mode exit should be 1; stderr: {$run['stderr']}");
        self::assertSame(['error' => 'Unsupported validation mode'], self::decode($run['stdout']));
    }

    public function testAbsentModeIsForm(): void
    {
        $spec = ['type' => 'group', 'properties' => ['name' => ['type' => 'text', 'validate' => ['required' => true]]]];
        $run = self::runCli(\json_encode(['spec' => $spec, 'data' => ['name' => '']], JSON_THROW_ON_ERROR));
        self::assertSame(0, $run['status'], "form mode exit should be 0; stderr: {$run['stderr']}");
        $out = self::decode($run['stdout']);
        self::assertIsArray($out);
        self::assertFalse($out['valid'], 'an absent mode must validate data as form mode');
    }
}
