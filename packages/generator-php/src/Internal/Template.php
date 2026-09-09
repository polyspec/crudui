<?php

declare(strict_types=1);

namespace CRUDUI\Generator;

use CRUDUI\FormError;
use CRUDUI\Validator\Compose\Compose;
use CRUDUI\Validator\Compose\MemoryLoader;
use stdClass;

/** Compose field structures independently of instance data. */
final class Template
{
    /** Compile composed properties into a serializable ordered template. */
    public static function compile(array|stdClass $spec, array $options): stdClass
    {
        $spec = Value::object($spec);
        if (($spec->type ?? null) !== 'group' || !($spec->properties ?? null) instanceof stdClass) {
            throw new FormError('INVALID_FORM_INPUT', 'A form spec must be a group with properties');
        }
        $properties = Compose::properties((array) $spec->properties, self::loader($options), $options['basepath'] ?? '');
        return Value::record(['kind' => 'crudui/form-template', 'keyPrefix' => $options['keyPrefix'] ?? Missing::Value, 'fields' => self::fields($properties)]);
    }

    /** Create the composition loader from explicitly supplied file objects. */
    public static function loader(array $options): MemoryLoader
    {
        $files = Value::object($options['files'] ?? []);
        $maps = [];
        foreach ($files as $path => $file) {
            if (!$file instanceof stdClass) {
                throw new FormError('INVALID_FORM_INPUT', 'Composition files must contain objects');
            }
            $maps[$path] = (array) $file;
        }
        return new MemoryLoader($maps);
    }

    private static function fields(array $properties): array
    {
        $out = [];
        foreach ($properties as $name => $raw) {
            if (!$raw instanceof stdClass && (!is_array($raw) || array_is_list($raw))) {
                continue;
            }
            $raw = (array) $raw;
            $children = $raw['properties'] ?? null;
            unset($raw['properties']);
            $out[] = (object) ['name' => (string) $name, 'spec' => Value::copy((object) $raw), 'children' => $children instanceof stdClass || is_array($children) && !array_is_list($children) ? self::fields((array) $children) : []];
        }
        return $out;
    }

    /** Reject values without the compiled form template kind and field list. */
    public static function check(stdClass $template): void
    {
        if (($template->kind ?? null) !== 'crudui/form-template' || !is_array($template->fields ?? null)) {
            throw new FormError('INVALID_FORM_INPUT', 'Unsupported form template');
        }
    }
}
