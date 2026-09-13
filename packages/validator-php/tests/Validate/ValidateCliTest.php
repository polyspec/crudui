<?php

declare(strict_types=1);

namespace CRUDUI\Validator\Tests\Validate;

use PHPUnit\Framework\TestCase;

/**
 * PHP CRUDUI validate CLI — stdin/stdout BOUNDARY conformance.
 *
 * The Validate::run ENGINE is already pinned by ValidateConformanceTest. This
 * test owns only the CLI wrapper boundary (bin/validate.php): serialization
 * (stdin JSON → Validate::run → stdout {valid,errors}), exit code, and the
 * PHP-specific LOAD-failure wire. It does NOT re-verify rule semantics — it
 * asserts the wrapper streams the engine result verbatim and routes a load
 * failure onto the PHP wire, not a valid:false masquerade.
 *
 * It executes `php bin/validate.php` from the package root and sends a UTF-8
 * request through stdin. A wrong exit code, a missing field or a load error
 * reported as a normal validation failure fails this test.
 *
 * Failure wire (identical in every language): a load or input failure exits 2
 * with stdout exactly {error, code, at}. A bad request (no spec / bad JSON)
 * exits 1 with stdout {error}.
 *
 * Do not weaken assertions. The fixture is the JS reference engine's own output;
 * the CLI must reproduce it verbatim on stdout.
 */
final class ValidateCliTest extends TestCase
{
    private const SHARED_FIXTURE = __DIR__ . '/../../../../tests/fixtures/validate/cases.json';
    private const CLI = __DIR__ . '/../../bin/validate.php';
    private const PKG_ROOT = __DIR__ . '/../..';

    /** @return array<string, array{0: array<string, mixed>}> */
    public static function fixtureProvider(): array
    {
        $path = \realpath(self::SHARED_FIXTURE);
        self::assertNotFalse($path, 'shared validate fixture not found: ' . self::SHARED_FIXTURE);
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
            'spec' => $case['spec'],
            'data' => $case['data'],
            'files' => $case['files'] ?? [],
            'basepath' => $case['basepath'] ?? '',
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    /** Numbers -> float so int/float spellings (5 vs 5.0) compare equal. */
    private static function normalize(mixed $v): mixed
    {
        if (\is_array($v)) {
            return \array_map([self::class, 'normalize'], $v);
        }
        if (\is_int($v) || \is_float($v)) {
            return (float) $v;
        }
        return $v;
    }

    /**
     * @dataProvider fixtureProvider
     * @param array<string, mixed> $case
     */
    public function testCliBoundary(array $case): void
    {
        self::assertTrue(
            \array_key_exists('expected', $case) !== \array_key_exists('expectFailure', $case),
            "case {$case['name']} must declare exactly one of expected or expectFailure",
        );

        $run = self::runCli(self::requestOf($case));

        if (\array_key_exists('expectFailure', $case)) {
            /** @var array{code: string, message: string, at: string} $expect */
            $expect = $case['expectFailure'];
            self::assertSame(2, $run['status'], "failure exit should be 2; stderr: {$run['stderr']}");
            $out = \json_decode(\trim($run['stdout']), true);
            self::assertSame(
                ['error' => $expect['message'], 'code' => $expect['code'], 'at' => $expect['at']],
                $out,
                "failure stdout mismatch for {$case['name']}",
            );
            return;
        }

        // Result case: exit 0, stdout is exactly {valid, errors} reproducing expected.
        self::assertSame(0, $run['status'], "result case exit should be 0; stderr: {$run['stderr']}");
        /** @var array<string, mixed>|null $out */
        $out = \json_decode(\trim($run['stdout']), true);
        self::assertIsArray($out, "non-JSON stdout: {$run['stdout']}");
        self::assertSame(['valid', 'errors'], \array_keys($out), 'stdout must carry exactly {valid, errors}');

        /** @var array{valid: bool, errors: list<array<string, mixed>>} $expected */
        $expected = $case['expected'];
        self::assertSame(
            self::normalize($expected),
            self::normalize($out),
            "CLI stdout mismatch for {$case['name']}",
        );
    }

    /** A malformed request exits 1 with exactly one non-empty {error} member. */
    private static function assertRequestFailure(array $run): void
    {
        self::assertSame(1, $run['status'], "malformed request must exit 1; stderr: {$run['stderr']}");
        $out = \json_decode(\trim($run['stdout']), true);
        self::assertIsArray($out, "malformed request stdout must be JSON: {$run['stdout']}");
        self::assertSame(['error'], \array_keys($out), 'malformed request must carry only {error}');
        self::assertNotSame('', $out['error']);
    }

    public function testMalformedEmptyStdinExits1(): void
    {
        self::assertRequestFailure(self::runCli(''));
    }

    public function testMalformedBadJsonExits1(): void
    {
        self::assertRequestFailure(self::runCli('{not json'));
    }

    public function testMalformedNonObjectSpecExits1(): void
    {
        self::assertRequestFailure(self::runCli(\json_encode(['spec' => 'not-an-object', 'data' => new \stdClass()])));
    }
}
