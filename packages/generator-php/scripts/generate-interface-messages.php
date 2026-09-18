<?php
/**
 * Generate src/Internal/InterfaceMessages.php from contracts/interface-messages.json.
 *
 * Run: php packages/generator-php/scripts/generate-interface-messages.php
 * With --stdout the source is printed instead of written.
 */
declare(strict_types=1);

$root = dirname(__DIR__, 3);
$contract = json_decode((string) file_get_contents($root . '/contracts/interface-messages.json'), true, 512, JSON_THROW_ON_ERROR);
if (($contract['format'] ?? null) !== 'crudui/interface-messages') {
    throw new RuntimeException('Unexpected contract format');
}

/** Write a language table as a PHP array. */
function crudui_language_table(array $messages): string
{
    $lines = [];
    $keys = array_keys($messages);

    foreach (array_chunk($keys, 5) as $chunk) {
        $items = [];
        foreach ($chunk as $key) {
            $items[] = var_export($key, true) . ' => ' . var_export($messages[$key], true);
        }
        $lines[] = '            ' . implode(', ', $items) . ',';
    }

    return "\n" . implode("\n", $lines) . "\n        ";
}

$form = $contract['form'];

$source = <<<'PHP'
<?php

// Generated from contracts/interface-messages.json by
// `php packages/generator-php/scripts/generate-interface-messages.php`. Do not edit.

declare(strict_types=1);

namespace CRUDUI\Generator;

/**
 * Interface message tables for all supported languages (ko, en, ja, zh).
 * Each table maps message keys to localized text strings.
 *
 * @internal
 */
final class InterfaceMessages
{
    /**
     * All interface messages for all supported languages.
     * Structure: language => [key => message]
     * @var array<string, array<string, string>>
     */
    public const MESSAGES = [
PHP;

foreach ($form as $lang => $messages) {
    $source .= "        '{$lang}' => [" . crudui_language_table($messages) . "],\n";
}

$source .= <<<'PHP'
    ];
}

PHP;

if (in_array('--stdout', $argv, true)) {
    echo $source;
} else {
    file_put_contents(dirname(__DIR__) . '/src/Internal/InterfaceMessages.php', $source);
}
