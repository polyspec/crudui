<?php
/**
 * Generate src/Values/UnicodeData.php from contracts/unicode-properties.json.
 *
 * Run: php packages/validator-php/scripts/generate-unicode-data.php
 * With --stdout the source is printed instead of written.
 */
declare(strict_types=1);

$root = dirname(__DIR__, 3);
$contract = json_decode((string) file_get_contents($root . '/contracts/unicode-properties.json'), true, 512, JSON_THROW_ON_ERROR);
if (($contract['format'] ?? null) !== 'crudui/unicode-properties') {
    throw new RuntimeException('Unexpected contract format');
}

/** Write ranges as a flat list of inclusive bounds, six ranges per line. */
function crudui_ranges(array $ranges, string $indent): string
{
    $lines = [];
    foreach (array_chunk($ranges, 6) as $chunk) {
        $bounds = array_map(static fn (array $range) => sprintf('0x%X, 0x%X', $range[0], $range[1]), $chunk);
        $lines[] = $indent . '    ' . implode(', ', $bounds) . ',';
    }
    return "[\n" . implode("\n", $lines) . "\n" . $indent . ']';
}

/** Write a name => ranges map. */
function crudui_table(array $table): string
{
    $lines = [];
    foreach ($table as $name => $ranges) {
        $lines[] = '        ' . var_export((string) $name, true) . ' => ' . crudui_ranges($ranges, '        ') . ',';
    }
    return "[\n" . implode("\n", $lines) . "\n    ]";
}

$version = $contract['unicodeVersion'];
$source = <<<PHP
<?php

// Generated from contracts/unicode-properties.json (Unicode {$version}) by
// `php packages/validator-php/scripts/generate-unicode-data.php`. Do not edit.

declare(strict_types=1);

namespace CRUDUI\\Validator\\Values;

/**
 * The Unicode data of the validation rules: inclusive code point ranges written as
 * flat lists of bounds (start, end, start, end, …).
 *
 * @internal
 */
final class UnicodeData
{
    /** Unicode version of the data. */
    public const VERSION = '{$version}';

    /** White_Space. */
    public const WHITE_SPACE = %s;

    /** General categories accepted by the pattern language, including one-letter unions. */
    public const GENERAL_CATEGORIES = %s;

    /** Scripts (the Script property) accepted by the pattern language. */
    public const SCRIPTS = %s;
}

PHP;
$output = sprintf($source, crudui_ranges($contract['whiteSpace'], '    '), crudui_table($contract['generalCategories']), crudui_table($contract['scripts']));
if (in_array('--stdout', $argv, true)) {
    echo $output;
} else {
    file_put_contents(dirname(__DIR__) . '/src/Values/UnicodeData.php', $output);
}
