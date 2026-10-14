<?php

declare(strict_types=1);

namespace Polyspec\Crudui\Conformance;

/**
 * Conformance evidence for PHP tests. A test that runs a shared fixture case records the feature it proves, the
 * fixture, the runtime and the case. Nothing is written unless CRUDUI_CONFORMANCE_EVIDENCE names a directory;
 * scripts/check-conformance.mts reads it. The autoload-dev of the root composer.json loads the class.
 */
final class Evidence
{
    /** Record one case result as a JSON line of this process. */
    public static function record(string $feature, string $fixture, string $runtime, string $case, bool $passed): void
    {
        foreach (
            ['feature' => $feature, 'fixture' => $fixture, 'runtime' => $runtime, 'case' => $case] as $key => $value
        ) {
            if ($value === '') {
                throw new \InvalidArgumentException("Conformance evidence {$key} must be a non-empty string");
            }
        }
        $directory = \getenv('CRUDUI_CONFORMANCE_EVIDENCE');
        if ($directory === false || $directory === '') {
            return;
        }
        if (!\is_dir($directory) && !\mkdir($directory, 0777, true) && !\is_dir($directory)) {
            throw new \RuntimeException("Cannot create conformance evidence directory {$directory}");
        }
        $line = \json_encode(
            ['feature' => $feature, 'fixture' => $fixture, 'runtime' => $runtime, 'case' => $case, 'passed' => $passed],
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR,
        );
        $file = $directory . DIRECTORY_SEPARATOR . 'php-' . \getmypid() . '.jsonl';
        if (\file_put_contents($file, $line . "\n", FILE_APPEND | LOCK_EX) === false) {
            throw new \RuntimeException("Cannot write conformance evidence {$file}");
        }
    }
}
