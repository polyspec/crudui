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
        self::checkFormDeclarations($spec);
        $properties = Compose::properties((array) $spec->properties, self::loader($options), $options['basepath'] ?? '');
        return Value::record([
            'kind' => 'crudui/form-template',
            'keyPrefix' => $options['keyPrefix'] ?? Missing::Value,
            'fields' => self::fields($properties),
            'buttons' => Value::copy(property_exists($spec, 'buttons') ? $spec->buttons : Buttons::DEFAULT),
            'action' => self::isObject($spec->action ?? null) ? Value::copy($spec->action) : Missing::Value,
        ]);
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

    /** A child that renders one scalar value: not repeated, not a group and not a language field. */
    private static function scalarChild(mixed $child): bool
    {
        if (!self::isObject($child)) {
            return false;
        }
        $child = (array) $child;
        $repeated = ($child['multiple'] ?? null) === true || self::isObject($child['multiple'] ?? null);
        $lang = ($child['lang'] ?? null) === true || self::isObject($child['lang'] ?? null);
        return ($child['type'] ?? null) !== 'group' && !array_key_exists('properties', $child) && !$repeated && !$lang;
    }

    /** Reject a wrong root action or buttons declaration. */
    private static function checkFormDeclarations(stdClass $spec): void
    {
        $fail = static function (string $key, string $expected): never {
            throw new FormError('INVALID_FORM_INPUT', sprintf('Invalid %s at form: expected %s', $key, $expected));
        };
        if (property_exists($spec, 'action')) {
            if (!self::isObject($spec->action)) {
                $fail('action', 'an object');
            }
            $action = (array) $spec->action;
            foreach (['method', 'url', 'enctype'] as $key) {
                if (array_key_exists($key, $action) && !is_string($action[$key])) {
                    $fail('action.' . $key, 'a string');
                }
            }
        }
        if (!property_exists($spec, 'buttons')) {
            return;
        }
        if (!is_array($spec->buttons) || !array_is_list($spec->buttons)) {
            $fail('buttons', 'a list of buttons');
        }
        // A button type without interface text needs declared text.
        $texts = Messages::forLanguage('ko');
        foreach ($spec->buttons as $index => $button) {
            $key = 'buttons.' . $index;
            if (!self::isObject($button)) {
                $fail($key, 'an object');
            }
            $declared = (array) $button;
            if (!in_array($declared['type'] ?? null, Buttons::TYPES, true)) {
                $fail($key . '.type', 'submit, reset, button or link');
            }
            foreach (['name', 'value', 'href'] as $name) {
                if (array_key_exists($name, $declared) && !is_string($declared[$name])) {
                    $fail($key . '.' . $name, 'a string');
                }
            }
            if (!array_key_exists($declared['type'], $texts) && !array_key_exists('text', $declared)) {
                $fail($key . '.text', 'content for this button type');
            }
            if ($declared['type'] === 'link' && !array_key_exists('href', $declared)) {
                $fail($key . '.href', 'a link target');
            }
            self::checkDeclarations($declared, 'form.' . $key);
        }
    }

    /** Reject a wrong value type in one field's multiple, lang and design declarations. */
    private static function checkDeclarations(array $spec, string $path): void
    {
        $fail = static function (string $key, string $expected) use ($path): never {
            throw new FormError('INVALID_FORM_INPUT', sprintf('Invalid %s at %s: expected %s', $key, $path, $expected));
        };
        // Buttons and the submission target belong to the form, not to a field.
        foreach (['buttons', 'action'] as $key) {
            if (array_key_exists($key, $spec)) {
                $fail($key, 'the form root');
            }
        }
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
                if (array_key_exists('title', $settings)) {
                    if (($spec['type'] ?? null) !== 'group') {
                        $fail('multiple.title', 'a repeated group');
                    }
                    $properties = self::isObject($spec['properties'] ?? null) ? (array) $spec['properties'] : [];
                    if (!is_string($settings['title']) || !array_key_exists($settings['title'], $properties) || !self::scalarChild($properties[$settings['title']])) {
                        $fail('multiple.title', 'the name of a direct child field without multiple, properties or lang');
                    }
                }
                if (array_key_exists('controls', $settings) && !in_array($settings['controls'], ['header', 'footer', 'outline'], true)) {
                    $fail('multiple.controls', 'header, footer or outline');
                }
                if (array_key_exists('header', $settings) && !in_array($settings['header'], ['static', 'sticky'], true)) {
                    $fail('multiple.header', 'static or sticky');
                }
            }
        }
        if (array_key_exists('lang', $spec) && !is_bool($spec['lang']) && !self::isObject($spec['lang'])) {
            $fail('lang', 'a boolean or an object');
        }
        if (self::isObject($spec['lang'] ?? null) && array_key_exists('only', (array) $spec['lang'])) {
            $only = ((array) $spec['lang'])['only'];
            $codes = is_array($only) && array_is_list($only) && array_filter($only, static fn ($code) => !is_string($code)) === [];
            if (!$codes && !self::isObject($only)) {
                $fail('lang.only', 'a list of language codes or an object');
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
