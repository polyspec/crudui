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
 * PHP LOAD wire (distinct from JS/Go/Rust): exit 0, stdout
 * {valid:false, errors:[{rule:"compose", code, message, ...}]}. A bad request
 * (no spec / bad JSON) writes STDERR and exits 1 with empty stdout.
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
            'data' => $case['data'] ?? [],
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
            \array_key_exists('expected', $case) || \array_key_exists('expectLoadError', $case),
            "case {$case['name']} must declare expected or expectLoadError",
        );

        $run = self::runCli(self::requestOf($case));

        if (\array_key_exists('expectLoadError', $case)) {
            // PHP LOAD wire: exit 0, {valid:false, errors:[{rule:"compose", code}]}.
            /** @var array{code: string} $expect */
            $expect = $case['expectLoadError'];
            self::assertSame(0, $run['status'], "LOAD case exit should be 0; stderr: {$run['stderr']}");

            /** @var array<string, mixed>|null $out */
            $out = \json_decode(\trim($run['stdout']), true);
            self::assertIsArray($out, "non-JSON stdout: {$run['stdout']}");
            self::assertFalse($out['valid'], 'LOAD failure must surface valid:false on the PHP wire');
            self::assertIsArray($out['errors']);
            $compose = null;
            foreach ($out['errors'] as $e) {
                if (\is_array($e) && ($e['rule'] ?? null) === 'compose') {
                    $compose = $e;
                    break;
                }
            }
            self::assertNotNull($compose, 'LOAD failure must carry a rule:"compose" error');
            self::assertSame($expect['code'], $compose['code'], "LOAD code mismatch for {$case['name']}");
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

    public function testMalformedEmptyStdinExits1(): void
    {
        $run = self::runCli('');
        self::assertSame(1, $run['status'], 'empty stdin must exit 1');
        self::assertSame('', \trim($run['stdout']), 'empty stdin must not emit a result on stdout');
        self::assertNotSame('', \trim($run['stderr']), 'empty stdin must write a diagnostic to STDERR');
    }

    public function testMalformedBadJsonExits1(): void
    {
        $run = self::runCli('{not json');
        self::assertSame(1, $run['status'], 'bad JSON must exit 1');
        self::assertSame('', \trim($run['stdout']));
    }

    public function testMalformedNonObjectSpecExits1(): void
    {
        $run = self::runCli(\json_encode(['spec' => 'not-an-object', 'data' => []]));
        self::assertSame(1, $run['status'], 'non-object spec must exit 1');
        self::assertSame('', \trim($run['stdout']));
    }
}
