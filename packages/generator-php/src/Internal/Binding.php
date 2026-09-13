<?php

declare(strict_types=1);

namespace CRUDUI\Generator;

use CRUDUI\FormError;
use stdClass;

/** Bind compiled fields to data without modifying either input. */
final class Binding
{
    /** Evaluate every field using one template and record. */
    public static function bind(stdClass $template, array|stdClass $data, array $options): array
    {
        Template::check($template);
        $data = Value::object($data);
        $options['keyPrefix'] ??= $template->keyPrefix ?? null;
        return array_map(static fn ($field) => self::field($field, $field->name, $data, $options, []), $template->fields);
    }

    /** Evaluate one field and its group, repeated or language children. */
    public static function field(stdClass $field, string $path, stdClass $data, array $options, array $rowSegments): stdClass
    {
        $spec = $field->spec;
        $type = Value::string($spec->type ?? '');
        $language = $options['language'] ?? 'ko';
        $design = Design::resolve($spec->design ?? null, $data, Value::segments($path));
        $label = Value::truthy($spec->label ?? null) ? Value::translate($spec->label, $language) : Missing::Value;
        $description = Value::truthy($spec->description ?? null) ? Value::translate($spec->description, $language) : Missing::Value;
        $base = ['shape' => 'leaf', 'type' => $type, 'path' => $path, 'wrapperName' => ($options['keyPrefix'] ?? null ? $options['keyPrefix'] . '.' : '') . str_replace('[]', '.*', $path) . '-layer', 'uniqid' => Value::elementId('', $path), 'design' => $design, 'label' => $label, 'omitLabel' => $type === 'hidden', 'description' => Value::truthy($description) ? $description : Missing::Value];
        $multiple = $spec->multiple ?? null;
        if ($multiple === true || $multiple instanceof stdClass) {
            $settings = ['show' => true];
            if ($multiple instanceof stdClass) {
                foreach (['min', 'max'] as $key) {
                    if (is_int($multiple->{$key} ?? null) || is_float($multiple->{$key} ?? null)) {
                        $settings[$key] = $multiple->{$key};
                    }
                }
                $settings['copy'] = ($multiple->copy ?? null) === true;
                $settings['sortable'] = ($multiple->sortable ?? null) === true;
            }
            $value = Value::path($data, $path);
            if ($value === Missing::Value) {
                $keys = ['__0000000000000__'];
            } elseif ($value instanceof stdClass) {
                $keys = array_map('strval', array_keys(get_object_vars($value)));
            } else {
                throw new FormError('INVALID_FORM_INPUT', 'Repeated data must be a keyed object: ' . $path);
            }
            $rows = [];
            $segments = [...$rowSegments, count(Value::segments($path))];
            foreach ($keys as $i => $key) {
                $rowPath = $path . '.' . $key;
                $rowDesign = Design::resolve($spec->design ?? null, $data, Value::segments($rowPath));
                $row = ['uniqid' => $key, 'wrapperClass' => Value::classes('input-group-wrapper', $i > 0 ? 'clone-element' : '', $rowDesign->wrapper->class)];
                if ($type === 'group') {
                    $row['groupClass'] = Value::classes('form-group', $rowDesign->group->class);
                    $row['children'] = self::children($field, $rowPath, $data, $options, $segments);
                } else {
                    $row['widget'] = Widget::evaluate($spec, Value::path($data, $rowPath), $rowPath, $rowDesign, $options, $segments);
                }
                $rows[] = (object) $row;
            }
            return Value::record(array_replace($base, ['shape' => $type === 'group' ? 'multiple-group' : 'multiple-leaf', 'rows' => $rows, 'multiple' => (object) $settings]));
        }
        if ($type === 'group') {
            return Value::record(array_replace($base, ['shape' => 'group', 'groupClass' => Value::classes('form-group', $design->group->class), 'groupStyle' => Value::style($design->group->style) ?? Missing::Value, 'children' => self::children($field, $path, $data, $options, $rowSegments)]));
        }
        $lang = $spec->lang ?? null;
        if ($lang === true || $lang instanceof stdClass) {
            $codes = is_array($lang->only ?? null) && $lang->only !== [] ? $lang->only : ['ko', 'en', 'ja', 'zh'];
            $children = [];
            foreach ($codes as $code) {
                $langPath = $path . '.' . $code;
                $langDesign = Design::resolve($spec->design ?? null, $data, Value::segments($langPath));
                $children[] = (object) ['code' => $code, 'widget' => Widget::evaluate($spec, Value::path($data, $langPath), $langPath, $langDesign, $options, $rowSegments)];
            }
            $title = Value::truthy($lang->title ?? null) ? Value::translate($lang->title, $language) : '';
            return Value::record(array_replace($base, ['shape' => 'lang', 'lang' => Value::record(['groupClass' => Value::classes(($lang->frame ?? true) === false ? 'lang-group p-0 border-0' : 'lang-group', $lang->group_class ?? ''), 'title' => $title !== '' ? $title : Missing::Value, 'children' => $children])]));
        }
        $value = Value::path($data, $path);
        if ($type === 'checkbox' || $type === 'switcher') {
            $checkedValue = $value === Missing::Value ? $spec->default ?? null : $value;
            return Value::record(array_replace($base, ['checkbox' => true, 'checkboxId' => Value::controlId($options['idPrefix'] ?? 'crudui', $path), 'checkboxName' => Value::name($path, $options['keyPrefix'] ?? null), 'checkboxClass' => Value::classes('valid-target', $design->main->class), 'checkboxChecked' => in_array($checkedValue, [true, 1, '1'], true)]));
        }
        $base['widget'] = Widget::evaluate($spec, $value, $path, $design, $options, $rowSegments);
        return Value::record($base);
    }

    private static function children(stdClass $field, string $path, stdClass $data, array $options, array $rows): array
    {
        return array_map(static fn ($child) => self::field($child, $path . '.' . $child->name, $data, $options, $rows), $field->children);
    }
}
