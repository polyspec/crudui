<?php

// Conformance evidence for PHP tests. A test that runs a shared fixture case records the feature
// it proves, the fixture, the runtime and the case. Nothing is written unless
// CRUDUI_CONFORMANCE_EVIDENCE names a directory; scripts/check-conformance.mjs reads it.

declare(strict_types=1);

if (!\function_exists('crudui_record_conformance')) {
    /** Record one case result. */
    function crudui_record_conformance(string $feature, string $fixture, string $runtime, string $case, bool $passed): void
    {
        foreach (['feature' => $feature, 'fixture' => $fixture, 'runtime' => $runtime, 'case' => $case] as $key => $value) {
            if ($value === '') throw new \InvalidArgumentException("Conformance evidence {$key} must be a non-empty string");
        }
        $directory = \getenv('CRUDUI_CONFORMANCE_EVIDENCE');
        if ($directory === false || $directory === '') return;
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
