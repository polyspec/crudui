<?php

declare(strict_types=1);

namespace CRUDUI\Generator;

use CRUDUI\FormError;
use stdClass;

/** Compose detail declarations and render one supplied record read-only. */
final class Details
{
    /** Build a detail model by delegating fields and cells to the list engine. */
    public static function build(array|stdClass $spec, array|stdClass $record, array $options): stdClass
    {
        $spec = self::root($spec, 'Detail specification must be an object');
        // Argument shapes in argument order, then the declaration, then options.
        $record = self::root($record, 'Detail record must be an object');
        if (!property_exists($spec, 'fields')) {
            throw new FormError('INVALID_FORM_INPUT', 'Detail specification must declare fields');
        }
        // An absent or null context is empty; data is a fixed object option.
        $data = $options['data'] ?? null;
        if ($data !== null && !$data instanceof stdClass && !(is_array($data) && ($data === [] || !array_is_list($data)))) {
            throw new FormError('INVALID_FORM_INPUT', 'Detail context must be an object');
        }
        $list = ['columns' => $spec->fields];
        if (property_exists($spec, 'design')) {
            $list['design'] = $spec->design;
        }
        // Page and total are list options; a detail neither checks nor uses them.
        $model = Lists::build((object) $list, [$record], array_diff_key($options, ['page' => true, 'total' => true]));
        $fields = [];
        $columns = $model->columns;
        $cells = $model->rows[0]->cells ?? [];
        foreach ($columns as $index => $column) {
            if (!isset($cells[$index])) {
                continue;
            }
            $cell = $cells[$index];
            $fields[] = (object) [
                'key' => $column->key,
                'label' => $column->label,
                'format' => $cell->format,
                'value' => $cell->value,
                'display' => $cell->display,
                'design' => $cell->design,
            ];
        }
        return (object) ['fields' => $fields, 'design' => $model->design];
    }

    /**
     * A root object argument, as every PHP API reads one: an empty array is the empty object and a
     * non-empty list-shaped array is not an object.
     */
    private static function root(array|stdClass $value, string $message): stdClass
    {
        if (is_array($value) && $value !== [] && array_is_list($value)) {
            throw new FormError('INVALID_FORM_INPUT', $message);
        }
        return Value::object($value);
    }

    /** Render one read-only detail as a definition list. */
    public static function render(array|stdClass $spec, array|stdClass $record, array $options): string
    {
        $model = self::build($spec, $record, $options);
        $design = $model->design;
        $attrs = ['class' => Value::classes('detail-view', $design->wrapper->class)];
        $style = Value::style($design->wrapper->style);
        if ($style !== null) {
            $attrs['style'] = $style;
        }
        $body = '';
        foreach ($model->fields as $field) {
            $cell = (object) ['display' => $field->display, 'design' => $field->design, 'format' => $field->format];
            $body .= Rendering::element('div', ['class' => 'detail-field'],
                Rendering::element('dt', ['class' => 'detail-label'], Rendering::text($field->label)) .
                Lists::renderCell($cell, 'dd', 'detail-value detail-value-' . $field->format->type));
        }
        return self::preloads($model) . Rendering::element('dl', $attrs, $body);
    }

    private static function preloads(stdClass $model): string
    {
        $seen = [];
        $html = '';
        foreach ($model->fields as $field) {
            $display = $field->display;
            if (!$display instanceof stdClass || ($display->kind ?? '') !== 'image') {
                continue;
            }
            $source = $display->src ?? '';
            if ($source === '' || str_starts_with(strtolower($source), 'data:') || isset($seen[$source])) {
                continue;
            }
            $seen[$source] = true;
            $html .= '<link' . Rendering::attrs(['rel' => 'preload', 'as' => 'image', 'href' => Rendering::url($source)]) . '/>';
        }
        return $html;
    }
}
