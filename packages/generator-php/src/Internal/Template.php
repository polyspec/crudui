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

    private static function fields(array $properties, string $parent = ''): array
    {
        $out = [];
        foreach ($properties as $name => $raw) {
            if (!$raw instanceof stdClass && (!is_array($raw) || array_is_list($raw))) {
                continue;
            }
            $raw = (array) $raw;
            $path = $parent === '' ? (string) $name : $parent . '.' . $name;
            self::checkDeclarations($raw, $path);
            $children = $raw['properties'] ?? null;
            unset($raw['properties']);
            $out[] = (object) ['name' => (string) $name, 'spec' => Value::copy((object) $raw), 'children' => $children instanceof stdClass || is_array($children) && !array_is_list($children) ? self::fields((array) $children, $path) : []];
        }
        return $out;
    }

    /** Objects are stdClass values or non-list associative arrays. */
    private static function isObject(mixed $value): bool
    {
        return $value instanceof stdClass || (is_array($value) && $value !== [] && !array_is_list($value));
    }

    /** A string, or a condition map: a non-empty object. */
    private static function conditionValue(mixed $value): bool
    {
        return is_string($value) || (self::isObject($value) && (array) $value !== []);
    }

    /** Reject a wrong value type in one field's multiple and design declarations. */
    private static function checkDeclarations(array $spec, string $path): void
    {
        $fail = static function (string $key, string $expected) use ($path): never {
            throw new FormError('INVALID_FORM_INPUT', sprintf('Invalid %s at %s: expected %s', $key, $path, $expected));
        };
        if (array_key_exists('multiple', $spec)) {
            $multiple = $spec['multiple'];
            if (!is_bool($multiple) && !self::isObject($multiple)) {
                $fail('multiple', 'a boolean or an object');
            }
            if (self::isObject($multiple)) {
                $settings = (array) $multiple;
                foreach (['min', 'max'] as $key) {
                    if (array_key_exists($key, $settings) && !is_int($settings[$key]) && !is_float($settings[$key])) {
                        $fail('multiple.' . $key, 'a number');
                    }
                }
                foreach (['copy', 'sortable'] as $key) {
                    if (array_key_exists($key, $settings) && !is_bool($settings[$key])) {
                        $fail('multiple.' . $key, 'a boolean');
                    }
                }
            }
        }
        if (!array_key_exists('design', $spec)) {
            return;
        }
        $design = $spec['design'];
        if (!is_bool($design) && !self::isObject($design)) {
            $fail('design', 'a boolean or an object');
        }
        if (is_bool($design)) {
            return;
        }
        $design = (array) $design;
        if (array_key_exists('show', $design) && !is_bool($design['show']) && !self::conditionValue($design['show'])) {
            $fail('design.show', 'an expression, a boolean or a condition map');
        }
        foreach (['class', 'style'] as $key) {
            if (array_key_exists($key, $design) && !self::conditionValue($design[$key])) {
                $fail('design.' . $key, 'a string or a condition map');
            }
        }
        foreach (['label', 'wrapper', 'group', 'prepend'] as $node) {
            if (!array_key_exists($node, $design)) {
                continue;
            }
            if (!self::isObject($design[$node])) {
                $fail('design.' . $node, 'an object');
            }
            $values = (array) $design[$node];
            foreach (['class', 'style'] as $key) {
                if (array_key_exists($key, $values) && !self::conditionValue($values[$key])) {
                    $fail('design.' . $node . '.' . $key, 'a string or a condition map');
                }
            }
        }
    }

    /** Reject values without the compiled form template kind and field list. */
    public static function check(stdClass $template): void
    {
        if (($template->kind ?? null) !== 'crudui/form-template' || !is_array($template->fields ?? null)) {
            throw new FormError('INVALID_FORM_INPUT', 'Unsupported form template');
        }
    }
}
