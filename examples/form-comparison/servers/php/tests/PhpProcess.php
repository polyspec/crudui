<?php

declare(strict_types=1);

namespace Polyspec\Crudui\FormComparison\Tests;

use RuntimeException;

/**
 * One child PHP process of a test: `php -n` with the mbstring and dom extensions that the binary builds as shared
 * modules, the extension modules a test names, the Composer autoloader of the checkout and one script.
 */
final class PhpProcess
{
    private function __construct(
        public readonly int $status,
        public readonly string $stdout,
        public readonly string $stderr,
    ) {
    }

    /**
     * Run `$script` after the autoloader in a child process with the extension modules `$modules` and the environment
     * variables `$environment` added to those of this process.
     *
     * @param list<string> $modules Absolute paths of extension modules.
     * @param array<string, string> $environment
     */
    public static function run(array $modules, string $script, array $environment = []): self
    {
        $arguments = [PHP_BINARY, '-n'];
        foreach (['mbstring', 'dom'] as $name) {
            if (!self::builtIn($name)) {
                array_push($arguments, '-d', 'extension=' . $name);
            }
        }
        foreach ($modules as $module) {
            array_push($arguments, '-d', 'extension=' . $module);
        }
        $autoload = dirname(__DIR__, 5) . '/vendor/autoload.php';
        array_push($arguments, '-r', 'require ' . var_export($autoload, true) . ';' . $script);
        $pipes = [];
        $process = proc_open($arguments, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, [
            ...getenv(),
            ...$environment,
        ]);
        if ($process === false) {
            throw new RuntimeException('Cannot start ' . PHP_BINARY);
        }
        $stdout = (string) stream_get_contents($pipes[1]);
        $stderr = (string) stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        return new self(proc_close($process), $stdout, $stderr);
    }

    /** The JSON value that the process wrote, which requires that it ended with status 0. */
    public function json(): mixed
    {
        if ($this->status !== 0) {
            throw new RuntimeException("The child PHP process ended with $this->status: $this->stderr$this->stdout");
        }
        return json_decode($this->stdout, false, 512, JSON_THROW_ON_ERROR);
    }

    /** Whether `php -n` has the extension `$name` without loading a module. */
    private static function builtIn(string $name): bool
    {
        $script = 'exit(extension_loaded(' . var_export($name, true) . ') ? 0 : 1);';
        return self::exitCode([PHP_BINARY, '-n', '-r', $script]) === 0;
    }

    /** @param list<string> $arguments */
    private static function exitCode(array $arguments): int
    {
        $process = proc_open($arguments, [], $pipes);
        if ($process === false) {
            throw new RuntimeException('Cannot start ' . PHP_BINARY);
        }
        return proc_close($process);
    }
}
