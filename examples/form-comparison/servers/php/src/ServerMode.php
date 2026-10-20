<?php

declare(strict_types=1);

namespace Polyspec\Crudui\FormComparison;

use RuntimeException;

/**
 * The PHP server mode of the form comparison: FORM_PHP_SERVER names php or php-ext, and the ordered_json and crudui
 * extensions must be loaded exactly in php-ext.
 */
final class ServerMode
{
    /** The selected server, php or php-ext, after requiring the JSON and CRUDUI extension modes it names. */
    public static function current(): string
    {
        $mode = getenv('FORM_PHP_SERVER') ?: 'php';
        if (!in_array($mode, ['php', 'php-ext'], true)) {
            throw new RuntimeException('Unknown PHP server mode');
        }
        if (extension_loaded('ordered_json') !== ($mode === 'php-ext')) {
            throw new RuntimeException('OrderedJSON extension state does not match the selected server');
        }
        if (extension_loaded('polyspec_crudui') !== ($mode === 'php-ext')) {
            throw new RuntimeException('CRUDUI extension state does not match the selected server');
        }
        return $mode;
    }
}
