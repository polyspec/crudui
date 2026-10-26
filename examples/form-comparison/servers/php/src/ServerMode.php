<?php

declare(strict_types=1);

namespace Polyspec\Crudui\FormComparison;

use Polyspec\OrderedJson\Value;
use ReflectionClass;
use RuntimeException;

/**
 * The PHP server mode of the form comparison: FORM_PHP_SERVER names php or php-ext. In php-ext, the JSON Value class
 * belongs to the extension named by FORM_JSON_EXTENSION and the CRUDUI extension is loaded.
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
        $json = new ReflectionClass(Value::class);
        if ($json->isInternal() !== ($mode === 'php-ext')) {
            throw new RuntimeException('OrderedJSON extension state does not match the selected server');
        }
        if ($mode === 'php-ext') {
            $extension = getenv('FORM_JSON_EXTENSION');
            if (!is_string($extension) || $extension === '') {
                throw new RuntimeException('FORM_JSON_EXTENSION must name the selected OrderedJSON extension');
            }
            if (!extension_loaded($extension) || $json->getExtensionName() !== $extension) {
                throw new RuntimeException('OrderedJSON extension state does not match the selected server');
            }
        }
        if (extension_loaded('polyspec_crudui') !== ($mode === 'php-ext')) {
            throw new RuntimeException('CRUDUI extension state does not match the selected server');
        }
        return $mode;
    }
}
