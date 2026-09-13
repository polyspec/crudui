<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Tests\Validate;

use PHPUnit\Framework\TestCase;

/**
 * PHP CRUDUI validate CLI — list mode stdin/stdout BOUNDARY conformance.
 *
 * The ListValidate ENGINE is already pinned by ListValidateConformanceTest. This
 * test owns only the CLI wrapper boundary (bin/validate.php with mode:"list"):
 * the request routes to the read sister, no data pass runs, and the structure
 * verdict streams verbatim to stdout {valid, errors}. It executes the CLI binary
 * and fails on a wrong mode route, a missing field or form validation in list mode.
 *
 * The shared fixture tests/fixtures/list-validity/cases.json is the truth via
 * its `engine` field:
 *  - engine:"pass"       → a clean load → {valid:true, errors:[]} (exit 0).
 *  - engine:{code, at}   → a load failure on the failure wire shared by every
 *    language and by form mode: exit 2, stdout exactly {error, code, at}.
 *
 * Do not weaken assertions.
 */
final class ListValidateCliTest extends TestCase
{
    private const SHARED_FIXTURE = __DIR__ . '/../../../../tests/fixtures/list-validity/cases.json';
    private const CLI = __DIR__ . '/../../bin/validate.php';
    private const PKG_ROOT = __DIR__ . '/../..';

    /** @return array<string, array{0: array<string, mixed>}> */
    public static function fixtureProvider(): array
    {
        $path = \realpath(self::SHARED_FIXTURE);
        self::assertNotFalse($path, 'shared list-validity fixture not found: ' . self::SHARED_FIXTURE);
        $raw = \file_get_contents($path);
        self::assertNotFalse($raw);
        /** @var list<array<string, mixed>> $cases */
        $cases = \json_decode($raw, true, 512, JSON_THROW_ON_ERROR);

        $objects = json_decode($raw, false, 512, JSON_THROW_ON_ERROR);
        $out = [];
        foreach ($cases as $index => $case) {
            foreach (['spec', 'data', 'files'] as $key) {
                if (property_exists($objects[$index], $key)) $case[$key] = $objects[$index]->{$key};
            }
            $out[$case['name']] = [$case];
        }
        return $out;
    }

    /**
     * Spawn the CLI exactly as the gateway does: `php bin/validate.php`,
     * cwd = package root, request piped on stdin.
     *
     * @return array{status: int, stdout: string, stderr: string}
     */
    private static function runCli(string $input): array
    {
        $cli = \realpath(self::CLI);
        self::assertNotFalse($cli, 'CLI not found: ' . self::CLI);
        $cwd = \realpath(self::PKG_ROOT);
        self::assertNotFalse($cwd);

        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];
        $proc = \proc_open([\PHP_BINARY, $cli], $descriptors, $pipes, $cwd);
        self::assertIsResource($proc, 'proc_open failed');

        \fwrite($pipes[0], $input);
        \fclose($pipes[0]);
        $stdout = \stream_get_contents($pipes[1]);
        $stderr = \stream_get_contents($pipes[2]);
        \fclose($pipes[1]);
        \fclose($pipes[2]);
        $status = \proc_close($proc);

        return [
            'status' => $status,
            'stdout' => $stdout === false ? '' : $stdout,
            'stderr' => $stderr === false ? '' : $stderr,
        ];
    }

    /** @param array<string, mixed> $case */
    private static function requestOf(array $case): string
    {
        return \json_encode([
            'mode' => 'list',
            'spec' => $case['spec'],
            'files' => $case['files'] ?? [],
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    /**
     * @dataProvider fixtureProvider
     * @param array<string, mixed> $case
     */
    public function testListCliBoundary(array $case): void
    {
        self::assertArrayHasKey('engine', $case, "case {$case['name']} must declare an engine expectation");

        $run = self::runCli(self::requestOf($case));
        /** @var array<string, mixed>|null $out */
        $out = \json_decode(\trim($run['stdout']), true);
        self::assertIsArray($out, "non-JSON stdout: {$run['stdout']}");

        if ($case['engine'] === 'pass') {
            self::assertSame(0, $run['status'], "clean list exit should be 0; stderr: {$run['stderr']}");
            self::assertSame(['valid' => true, 'errors' => []], $out, "case {$case['name']} should load clean");
            return;
        }

        // engine:{code, at} — load failure: exit 2, exactly {error, code, at}.
        /** @var array{code: string, at: string} $want */
        $want = $case['engine'];
        self::assertSame(2, $run['status'], "list load failure exit should be 2; stderr: {$run['stderr']}");
        self::assertSame(['error', 'code', 'at'], \array_keys($out), 'failure stdout must carry exactly {error, code, at}');
        self::assertIsString($out['error']);
        self::assertNotSame('', $out['error'], "case {$case['name']} failure must carry a message");
        self::assertSame($want['code'], $out['code'], "failure code mismatch for {$case['name']}");
        self::assertSame($want['at'], $out['at'], "failure location mismatch for {$case['name']}");
    }

    public function testFormModeUntouchedByListBranch(): void
    {
        // A request with no `mode` runs the form pipeline exactly as before — a
        // minimal valid form spec validates with no errors.
        $req = \json_encode([
            'spec' => ['type' => 'group', 'properties' => ['name' => ['type' => 'text']]],
            'data' => ['name' => 'x'],
        ], JSON_THROW_ON_ERROR);
        $run = self::runCli($req);
        self::assertSame(0, $run['status'], "form mode exit should be 0; stderr: {$run['stderr']}");
        /** @var array<string, mixed>|null $out */
        $out = \json_decode(\trim($run['stdout']), true);
        self::assertIsArray($out);
        self::assertTrue($out['valid'], 'form mode must remain valid for a clean spec: ' . \json_encode($out));
    }
}
