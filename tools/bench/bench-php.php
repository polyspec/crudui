#!/usr/bin/env php
<?php
/**
 * bench-php.php — in-process throughput benchmark for validator-php.
 *
 * Mirrors bench-js.js: load the validator via composer autoload, build the
 * Validator once per spec, loop validate($input) N times in a SINGLE process.
 * PHP process startup, autoload, JSON decode, and fixture I/O all happen
 * BEFORE timing — the measured window is validate-only, same as the other
 * languages. A per-case process spawn is NOT used here; it would fold the PHP
 * interpreter boot cost into every iteration and is unfair for a throughput
 * comparison.
 *
 * stdout: one JSON line per spec (same shape as the other drivers).
 *
 * Args: --iters N (default 50000), --warmup N (default 5000), --spec NAME.
 */

declare(strict_types=1);

require_once __DIR__ . '/../../packages/validator-php/vendor/autoload.php';

use CRUDUI\Validator\Validate\Validator;

$FIXTURES = __DIR__ . '/fixtures';

function parse_args(array $argv): array
{
    $out = ['iters' => 50000, 'warmup' => 5000, 'spec' => null];
    for ($i = 1; $i < count($argv); $i++) {
        if ($argv[$i] === '--iters') {
            $out['iters'] = (int) $argv[++$i];
        } elseif ($argv[$i] === '--warmup') {
            $out['warmup'] = (int) $argv[++$i];
        } elseif ($argv[$i] === '--spec') {
            $out['spec'] = $argv[++$i];
        }
    }
    return $out;
}

function load_fixture(string $dir, string $name): array
{
    $spec = json_decode(file_get_contents("$dir/$name.spec.json"), true);
    $input = json_decode(file_get_contents("$dir/$name.input.json"), true);
    return [$spec, $input];
}

function first_error($result): array
{
    if ($result->valid) {
        return [null, null];
    }
    $errors = $result->errors;
    if (count($errors) === 0) {
        return [null, null];
    }
    $first = reset($errors);
    return [$first['rule'] ?? null, $first['field'] ?? null];
}

function bench_spec(string $dir, string $name, int $iters, int $warmup): array
{
    [$spec, $input] = load_fixture($dir, $name);

    // Build the validator once; reuse across iterations.
    $validator = new Validator($spec);

    // Warmup.
    for ($i = 0; $i < $warmup; $i++) {
        $validator->validate($input);
    }

    $start = hrtime(true);
    for ($i = 0; $i < $iters; $i++) {
        $validator->validate($input);
    }
    $end = hrtime(true);

    $ns = (float) ($end - $start);
    $ms = $ns / 1e6;
    $opsSec = (int) round(($iters / $ns) * 1e9);
    $avgUs = $ns / 1000.0 / $iters;

    $result = $validator->validate($input);
    [$error, $field] = first_error($result);

    return [
        'lang' => 'php',
        'spec' => $name,
        'iters' => $iters,
        'ms' => round($ms, 3),
        'opsSec' => $opsSec,
        'avgUs' => round($avgUs, 4),
        'valid' => $result->valid,
        'error' => $error,
        'field' => $field,
    ];
}

$args = parse_args($argv);
$specs = $args['spec'] !== null ? [$args['spec']] : ['contact', 'large'];
foreach ($specs as $name) {
    $r = bench_spec($FIXTURES, $name, $args['iters'], $args['warmup']);
    echo json_encode($r) . "\n";
}
