<?php

declare(strict_types=1);

namespace CRUDUI\Generator;

use CRUDUI\FormError;
use stdClass;

/** Bind compiled fields to data as nodes of the recursive form grammar. */
final class Binding
{
    private const LANGUAGES = ['ko', 'en', 'ja', 'zh'];

    /** Evaluate every field using one template and record. */
    public static function bind(stdClass $template, array|stdClass $data, array $options): array
    {
        Template::check($template);
        $data = Value::object($data);
        $options['language'] ??= 'ko';
        // Callers can pass decoded JSON; each text option is a string when present.
        if (!is_string($options['language'])) {
            throw new FormError('INVALID_FORM_INPUT', 'Language must be a string');
        }
        foreach (['keyPrefix', 'idPrefix'] as $name) {
            if (($options[$name] ?? null) !== null && !is_string($options[$name])) {
                throw new FormError('INVALID_FORM_INPUT', $name . ' must be a string');
            }
        }
        if (($options['unsupported'] ?? null) !== null && !in_array($options['unsupported'], ['throw', 'marker'], true)) {
            throw new FormError('INVALID_FORM_INPUT', 'unsupported must be throw or marker');
        }
        $options['messages'] = Messages::forLanguage($options['language']);
        $options['keyPrefix'] ??= $template->keyPrefix ?? null;
        $options = ['rowSegments' => [], 'rowNumbers' => [], 'stickyDepth' => 0, ...$options];
        $options['rowSegments'] = $options['rowNumbers'] = [];
        $options['stickyDepth'] = 0;
        return array_map(static fn ($field) => self::field($field, $field->name, $data, $options), $template->fields);
    }

    /** Build the node for one field and its group, collection or language children. */
    public static function field(stdClass $field, string $path, stdClass $data, array $state): stdClass
    {
        $spec = $field->spec;
        $design = Design::resolve($spec->design ?? null, $data, Value::segments($path));
        $label = Value::truthy($spec->label ?? null) ? Value::translate($spec->label, $state['language']) : Missing::Value;
        $description = Value::truthy($spec->description ?? null) ? Value::translate($spec->description, $state['language']) : Missing::Value;
        $multiple = self::multiple($spec);
        if ($multiple !== null) {
            return self::collection($field, $path, $data, $design, $label, $description, $multiple, $state);
        }
        if (($spec->type ?? null) === 'group') {
            self::checkGroup(Value::path($data, $path), $path);
            return Value::record([...self::root('group', $path, $design), 'header' => self::header(['label' => $label, 'description' => $description], $design), 'body' => self::body($design->group->class, $design->group->style), 'children' => self::children($field, $path, $data, $state)]);
        }
        $lang = $spec->lang ?? null;
        if ($lang === true || $lang instanceof stdClass) {
            return self::lang($spec, $path, $data, $design, $label, $description, $lang, $state);
        }
        return self::leaf($spec, $path, $data, $design, $label, $description, $state);
    }

    /** Evaluated controls and limits for a repeated field, or null when the field does not repeat. */
    private static function multiple(stdClass $spec): ?array
    {
        $multiple = $spec->multiple ?? null;
        if ($multiple === true) {
            return ['copy' => false, 'sortable' => false, 'controls' => 'header', 'header' => 'static'];
        }
        if (!$multiple instanceof stdClass) {
            return null;
        }
        $settings = [];
        foreach (['min', 'max'] as $key) {
            if (is_int($multiple->{$key} ?? null) || is_float($multiple->{$key} ?? null)) {
                $settings[$key] = $multiple->{$key};
            }
        }
        $settings['copy'] = ($multiple->copy ?? null) === true;
        $settings['sortable'] = ($multiple->sortable ?? null) === true;
        if (is_string($multiple->title ?? null)) {
            $settings['title'] = $multiple->title;
        }
        $settings['controls'] = in_array($multiple->controls ?? null, ['footer', 'outline'], true) ? $multiple->controls : 'header';
        $settings['header'] = ($multiple->header ?? null) === 'sticky' ? 'sticky' : 'static';
        return $settings;
    }

    private static function root(string $kind, string $path, stdClass $design): array
    {
        return ['kind' => $kind, 'path' => $path, 'className' => $design->wrapper->class, 'style' => Value::style($design->wrapper->style) ?? Missing::Value, 'hidden' => !$design->show];
    }

    /** Header with the given parts, or the missing marker when every part is empty. */
    private static function header(array $parts, stdClass $design): stdClass|Missing
    {
        $present = array_filter($parts, static fn ($value) => $value !== Missing::Value && $value !== '');
        if ($present === []) {
            return Missing::Value;
        }
        return Value::record(['className' => $design->label->class, 'style' => Value::style($design->label->style) ?? Missing::Value, ...$present]);
    }

    private static function body(string $className = '', mixed $style = null, ?string $id = null): stdClass
    {
        return Value::record(['className' => $className, 'style' => Value::style($style) ?? Missing::Value, 'id' => $id ?? Missing::Value]);
    }

    private static function action(string $name, string $label, bool $disabled): stdClass
    {
        return (object) ['name' => $name, 'label' => $label, 'disabled' => $disabled];
    }

    private static function leaf(stdClass $spec, string $path, stdClass $data, stdClass $design, string|Missing $label, string|Missing $description, array $state): stdClass
    {
        $type = Value::string($spec->type ?? '');
        $value = Value::path($data, $path);
        $root = self::root('field', $path, $design);
        if ($type === 'checkbox' || $type === 'switcher') {
            $checkedValue = $value === Missing::Value ? $spec->default ?? null : $value;
            $checkbox = (object) ['id' => Value::controlId($state['idPrefix'] ?? 'crudui', $path), 'name' => Value::name($path, $state['keyPrefix'] ?? null), 'className' => Value::classes('valid-target', $design->main->class), 'checked' => in_array($checkedValue, [true, 1, '1'], true), 'caption' => $label === Missing::Value ? '' : $label];
            return Value::record([...$root, 'header' => self::header(['description' => $description], $design), 'body' => self::body(), 'checkbox' => $checkbox]);
        }
        $widget = Widget::evaluate($spec, $value, $path, $design, $state, $state['rowSegments']);
        if ($type === 'hidden') {
            return Value::record([...$root, 'body' => self::body(), 'widget' => $widget]);
        }
        $labelFor = $label !== Missing::Value && $label !== '' && !($widget->unsupported ?? false) ? $widget->extra->file->id ?? $widget->attrs->id ?? Missing::Value : Missing::Value;
        return Value::record([...$root, 'header' => self::header(['label' => $label, 'labelFor' => $labelFor, 'description' => $description], $design), 'body' => self::body(), 'widget' => $widget]);
    }

    private static function collection(stdClass $field, string $path, stdClass $data, stdClass $design, string|Missing $label, string|Missing $description, array $settings, array $state): stdClass
    {
        $value = Value::path($data, $path);
        if ($value === Missing::Value) {
            $keys = ['__0000000000000__'];
        } elseif ($value instanceof stdClass) {
            $keys = array_map('strval', array_keys(get_object_vars($value)));
        } else {
            throw new FormError('INVALID_FORM_INPUT', 'Repeated data must be a keyed object: ' . $path);
        }
        $item = ($field->spec->type ?? null) === 'group' ? 'group' : 'field';
        $rows = [];
        foreach ($keys as $index => $key) {
            $rows[] = self::row($field, $path, $key, $index, count($keys), $item, $label, $settings, $data, $state);
        }
        $messages = $state['messages'];
        $controls = Missing::Value;
        if ($keys === []) {
            $full = isset($settings['max']) && count($keys) >= $settings['max'];
            $controls = (object) ['placement' => 'footer', 'label' => $messages['collectionControls'], 'actions' => [self::action('add-row', $messages['addRow'], $full)]];
        }
        $header = self::header(['label' => $label, 'description' => $description, 'count' => Messages::count($messages['count'], count($keys))], $design);
        return Value::record([...self::root('collection', $path, $design), 'header' => $header, 'body' => self::body(), 'item' => $item, 'controls' => $controls, 'children' => $rows]);
    }

    private static function row(stdClass $field, string $collectionPath, string $key, int $index, int $count, string $item, string|Missing $label, array $settings, stdClass $data, array $state): stdClass
    {
        $spec = $field->spec;
        $messages = $state['messages'];
        $label = $label === '' ? Missing::Value : $label;
        $rowPath = $collectionPath . '.' . $key;
        $rowDesign = Design::resolve($spec->design ?? null, $data, Value::segments($rowPath));
        $numbers = [...$state['rowNumbers'], $index + 1];
        $sticky = $settings['header'] === 'sticky';
        $rowState = ['rowSegments' => [...$state['rowSegments'], count(Value::segments($collectionPath))], 'rowNumbers' => $numbers, 'stickyDepth' => $state['stickyDepth'] + ($sticky ? 1 : 0)] + $state;
        $full = isset($settings['max']) && $count >= $settings['max'];
        $actions = [];
        if ($settings['sortable']) {
            $actions[] = self::action('move-up', $messages['moveUp'], $index === 0);
            $actions[] = self::action('move-down', $messages['moveDown'], $index === $count - 1);
        }
        $actions[] = self::action('add-row', $messages['addRow'], $full);
        if ($settings['copy']) {
            $actions[] = self::action('copy-row', $messages['copyRow'], $full);
        }
        $actions[] = self::action('remove-row', $messages['removeRow'], isset($settings['min']) && $count <= $settings['min']);
        $row = ['kind' => 'row', 'key' => $key, 'className' => '', 'hidden' => false, 'controls' => (object) ['placement' => $settings['controls'], 'label' => $messages['rowControls'], 'actions' => $actions]];
        if ($sticky) {
            $row += ['sticky' => true, 'stickyDepth' => $state['stickyDepth']];
        }
        $number = implode('.', $numbers);
        if ($item === 'field') {
            $widget = Widget::evaluate($spec, Value::path($data, $rowPath), $rowPath, $rowDesign, $rowState, $rowState['rowSegments']);
            return Value::record([...$row, 'header' => Value::record(['className' => '', 'label' => $label, 'number' => $number]), 'body' => self::body(), 'widget' => $widget]);
        }
        self::checkGroup(Value::path($data, $rowPath), $rowPath);
        $children = self::children($field, $rowPath, $data, $rowState);
        $nested = array_filter($children, static fn ($child) => $child->kind === 'collection');
        $summary = $nested === [] ? $messages['collapsed'] : Messages::count($messages['children'], array_sum(array_map(static fn ($child) => count($child->children), $nested)));
        $title = Missing::Value;
        if (isset($settings['title'])) {
            $value = Value::path($data, $rowPath . '.' . $settings['title']);
            $title = $value === Missing::Value || $value === null || $value === '' ? $messages['untitled'] : Value::string($value);
        }
        $header = Value::record(['className' => '', 'label' => $label, 'number' => $number, 'title' => $title, 'summary' => $summary]);
        $body = self::body($rowDesign->group->class, $rowDesign->group->style, Value::controlId($state['idPrefix'] ?? 'crudui', $rowPath) . ':body');
        return Value::record([...$row, 'header' => $header, 'body' => $body, 'collapsible' => true, 'expanded' => true, 'toggleLabel' => $messages['toggleRow'], 'children' => $children]);
    }

    private static function lang(stdClass $spec, string $path, stdClass $data, stdClass $design, string|Missing $label, string|Missing $description, true|stdClass $lang, array $state): stdClass
    {
        $settings = $lang instanceof stdClass ? $lang : new stdClass();
        $codes = is_array($settings->only ?? null) && $settings->only !== [] ? $settings->only : self::LANGUAGES;
        $title = Value::truthy($settings->title ?? null) ? Value::translate($settings->title, $state['language']) : '';
        $frame = ($settings->frame ?? null) !== false;
        $groupClass = is_string($settings->group_class ?? null) ? $settings->group_class : '';
        $children = [];
        foreach ($codes as $code) {
            $langPath = $path . '.' . Value::string($code);
            $langDesign = Design::resolve($spec->design ?? null, $data, Value::segments($langPath));
            $children[] = (object) ['kind' => 'lang-item', 'lang' => $code, 'className' => '', 'hidden' => false, 'header' => (object) ['className' => '', 'label' => $code], 'body' => self::body(), 'widget' => Widget::evaluate($spec, Value::path($data, $langPath), $langPath, $langDesign, $state, $state['rowSegments'])];
        }
        $header = self::header(['label' => $label, 'description' => $description, 'title' => $title], $design);
        $root = self::root('lang', $path, $design);
        // A framed language group is a node modifier; the stylesheet draws the frame around its body.
        $root['className'] = Value::classes($frame ? 'crudui-node--framed' : '', $root['className']);
        return Value::record([...$root, 'header' => $header, 'body' => self::body(Value::classes($groupClass)), 'children' => $children]);
    }

    /** Present group data, including a repeated group row, must be an object. */
    private static function checkGroup(mixed $value, string $path): void
    {
        if ($value !== Missing::Value && !$value instanceof stdClass) {
            throw new FormError('INVALID_FORM_INPUT', 'Group data must be an object: ' . $path);
        }
    }

    private static function children(stdClass $field, string $path, stdClass $data, array $state): array
    {
        return array_map(static fn ($child) => self::field($child, $path . '.' . $child->name, $data, $state), $field->children);
    }
}
