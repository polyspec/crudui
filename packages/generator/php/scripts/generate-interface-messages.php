<?php

/**
 * Generate src/Internal/InterfaceMessages.php from contracts/interface-messages.json.
 *
 * Run: php packages/generator/php/scripts/generate-interface-messages.php
 * With --stdout the source is printed instead of written.
 */

declare(strict_types=1);

require dirname(__DIR__, 4) . '/scripts/generator-contract.php';

$contract = crudui_read_contract(dirname(__DIR__, 4), 'interface-messages');

/** Write a language table as a PHP array, one message on each line, so no line exceeds the PSR-12 limit. */
$crudui_language_table = static function (array $messages): string {
    $lines = [];
    foreach ($messages as $key => $message) {
        $lines[] = '            ' . var_export($key, true) . ' => ' . var_export($message, true) . ',';
    }

    return "\n" . implode("\n", $lines) . "\n        ";
};

$form = $contract['form'];
$list = $contract['list'];

$source = <<<'PHP'
<?php

// Generated from contracts/interface-messages.json by
// `php packages/generator/php/scripts/generate-interface-messages.php`. Do not edit.

declare(strict_types=1);

namespace Polyspec\Crudui\Generator;

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
$source .= "\n";

foreach ($form as $lang => $messages) {
    $source .= "        '{$lang}' => [" . $crudui_language_table($messages) . "],\n";
}

$source .= <<<'PHP'
    ];

    /**
     * List pagination and empty state messages for all supported languages.
     * Structure: language => [key => message]
     * @var array<string, array<string, string>>
     */
    public const LIST = [
PHP;
$source .= "\n";

foreach ($list as $lang => $messages) {
    $source .= "        '{$lang}' => [" . $crudui_language_table($messages) . "],\n";
}

$source .= <<<'PHP'
    ];
}

PHP;

crudui_emit_source($source, dirname(__DIR__) . '/src/Internal/InterfaceMessages.php', $argv);
