<?php

declare(strict_types=1);

namespace CRUDUI\Generator;

use CRUDUI\FormError;
use CRUDUI\Validator\Compose\Compose;
use CRUDUI\Validator\Support\NumberValue;
use stdClass;

/** Compose list declarations, evaluate supplied rows and render table or card HTML. */
final class Lists
{
    /** Build one read-only list model from validated public inputs. */
    public static function buildPublic(array|stdClass $spec, array $rows, array $options): stdClass
    {
        if (is_array($spec) && !self::isObject($spec, true)) {
            throw new FormError('INVALID_FORM_INPUT', 'List specification must be an object');
        }
        if (!array_is_list($rows)) {
            throw new FormError('INVALID_FORM_INPUT', 'List rows must be an array');
        }
        foreach ($rows as $row) {
            if (!self::isObject($row, false)) {
                throw new FormError('INVALID_FORM_INPUT', 'List rows must be objects');
            }
        }
        self::optionObject($options, 'data', 'List context must be an object');
        self::countOptions($options);
        return self::build(Value::object($spec), $rows, $options, 'list', 'columns');
    }

    /** Render composed list columns, supplied rows, actions and pagination. */
    public static function render(array|stdClass $spec, array $rows, array $options): string
    {
        if (is_array($spec) && !self::isObject($spec, true)) {
            throw new FormError('INVALID_FORM_INPUT', 'List specification must be an object');
        }
        if (!array_is_list($rows)) {
            throw new FormError('INVALID_FORM_INPUT', 'List rows must be an array');
        }
        foreach ($rows as $row) {
            if (!self::isObject($row, false)) {
                throw new FormError('INVALID_FORM_INPUT', 'List rows must be objects');
            }
        }
        self::optionObject($options, 'data', 'List context must be an object');
        self::countOptions($options);
        $layout = $options['layout'] ?? 'table';
        if ($layout !== 'table' && $layout !== 'card') {
            throw new FormError('INVALID_FORM_INPUT', 'List layout must be table or card');
        }
        $vm = self::build(Value::object($spec), $rows, $options, 'list', 'columns');
        $attrs = self::node('crudui-list', $vm->design->wrapper);
        $body = '';
        if ($vm->actions !== []) {
            $actions = '';
            foreach ($vm->actions as $action) {
                $attrsAction = [];
                $tag = 'button';
                if (($action->format->type ?? null) === 'link') {
                    $tag = 'a';
                    $href = $action->format->options->href ?? '#';
                    $attrsAction['href'] = is_string($href) ? $href : '#';
                    if (is_string($action->format->options->target ?? null)) {
                        $attrsAction['target'] = $action->format->options->target;
                    }
                } else {
                    $attrsAction['type'] = 'button';
                }
                foreach ($action->behavior ?? [] as $event => $script) {
                    $attrsAction['on' . $event] = $script;
                }
                $actions .= Rendering::element('span', ['class' => 'crudui-list__action', 'data-action' => $action->key], Rendering::element($tag, $attrsAction, Rendering::text($action->label, true), true));
            }
            $body .= Rendering::element('div', ['class' => 'crudui-list__actions'], $actions);
        }
        if ($vm->rows === []) {
            $body .= Rendering::element('div', ['class' => 'crudui-list__empty'], Rendering::text($vm->empty));
        } elseif ($layout === 'table') {
            $headers = '';
            foreach ($vm->columns as $column) {
                $header = self::node('crudui-list__heading', $column->design->main);
                if ($column->field !== '') {
                    $header['data-field'] = $column->field;
                }
                if ($column->sortable) {
                    $header['data-sortable'] = 'true';
                }
                if (isset($vm->sort) && in_array($vm->sort->field, [$column->field, $column->key], true)) {
                    $header['data-sort-dir'] = $vm->sort->dir;
                }
                $headers .= Rendering::element('th', $header, Rendering::element('span', ['class' => 'crudui-list__heading-label'], Rendering::text($column->label)) . ($column->sortable ? Rendering::element('span', ['class' => 'crudui-list__sort'], '↕') : ''));
            }
            $bodyRows = '';
            foreach ($vm->rows as $row) {
                $cells = '';
                foreach ($row->cells as $cell) {
                    $cells .= self::cell($cell, 'td', 'crudui-list__cell crudui-value crudui-value--' . $cell->format->type);
                }
                $bodyRows .= Rendering::element('tr', [], $cells);
            }
            $body .= Rendering::element('table', ['class' => 'crudui-list__table'], Rendering::element('thead', [], Rendering::element('tr', [], $headers)) . Rendering::element('tbody', [], $bodyRows));
        } else {
            $cards = '';
            foreach ($vm->rows as $row) {
                $cells = '';
                foreach ($row->cells as $i => $cell) {
                    $class = Value::classes('crudui-list__cell crudui-value crudui-value--' . $cell->format->type, $cell->design->main->class);
                    $cells .= Rendering::element('div', ['class' => $class], Rendering::element('span', ['class' => 'crudui-list__card-label'], Rendering::text($vm->columns[$i]->label)) . self::cell($cell, 'span', 'crudui-list__card-value'));
                }
                $cards .= Rendering::element('article', ['class' => 'crudui-list__card'], $cells);
            }
            $body .= Rendering::element('div', ['class' => 'crudui-list__cards'], $cards);
        }
        if ($vm->pagination->enabled) {
            $pagination = ['class' => 'crudui-list__pagination'];
            foreach (['mode' => 'mode', 'perPage' => 'per-page', 'page' => 'page', 'total' => 'total'] as $key => $attribute) {
                if (property_exists($vm->pagination, $key)) {
                    $pagination['data-' . $attribute] = Value::scalar($vm->pagination->{$key});
                }
            }
            $body .= Rendering::element('nav', $pagination);
        }
        return self::preloads($vm) . Rendering::element('div', $attrs, $body);
    }

    /**
     * Compose columns and evaluate ordered list and cell models. $own names the path of the
     * specification's own design and $members the path prefix of each column design.
     */
    public static function build(stdClass $spec, array $rows, array $options, string $own, string $members): stdClass
    {
        $spec = Value::spec($spec);
        $language = $options['language'] ?? 'ko';
        self::optionObject($options, 'data', 'List context must be an object');
        $data = Value::object($options['data'] ?? []);
        $columns = Compose::properties((array) ($spec->columns ?? new stdClass()), Template::loader($options), $options['basepath'] ?? '');
        // Declarations are checked after the input rules and composition: the own design, then each member.
        if (property_exists($spec, 'design')) {
            Template::checkDesignDeclaration($spec->design, $own);
        }
        foreach ($columns as $key => $raw) {
            if (($raw instanceof stdClass || is_array($raw)) && array_key_exists('design', (array) $raw)) {
                Template::checkDesignDeclaration(((array) $raw)['design'], $members . '.' . $key);
            }
        }
        $columnModels = [];
        $columnSpecs = [];
        foreach ($columns as $key => $raw) {
            if (!$raw instanceof stdClass && !is_array($raw)) {
                continue;
            }
            $raw = (object) $raw;
            $design = Design::resolve($raw->design ?? null, $data, []);
            if (!$design->show) {
                continue;
            }
            $columnModels[] = (object) ['key' => (string) $key, 'field' => is_string($raw->field ?? null) ? $raw->field : '', 'label' => property_exists($raw, 'label') ? Value::translate($raw->label, $language) : (string) $key, 'format' => self::format($raw->format ?? null), 'sortable' => isset($raw->sortable) ? Design::show($raw->sortable, $data, []) : false, 'design' => $design];
            $columnSpecs[] = $raw;
        }
        $rowModels = [];
        foreach ($rows as $row) {
            if (!self::isObject($row, false)) {
                throw new FormError('INVALID_FORM_INPUT', 'List rows must be objects');
            }
            $row = Value::object($row);
            $cells = [];
            foreach ($columnModels as $i => $column) {
                $path = $column->field;
                $value = $path !== '' ? Value::path($row, $path) : Missing::Value;
                // A model is JSON: a path absent from the row is null, and the member is always present.
                $cells[] = Value::record(['format' => $column->format, 'value' => $value === Missing::Value ? null : $value, 'display' => self::display($column->format, $value, $row, Value::segments($path), $language), 'design' => Design::resolve($columnSpecs[$i]->design ?? null, $row, Value::segments($path))]);
            }
            $rowModels[] = (object) ['cells' => $cells];
        }
        $page = $spec->pagination ?? null;
        $pagination = ['enabled' => $page === true || $page instanceof stdClass];
        if ($page instanceof stdClass) {
            if (is_int($page->per_page ?? null) || is_float($page->per_page ?? null)) {
                $pagination['perPage'] = $page->per_page;
            }
            if (is_string($page->mode ?? null)) {
                $pagination['mode'] = $page->mode;
            }
        }
        foreach (self::countOptions($options) as $key => $count) {
            if ($count !== null) {
                $pagination[$key] = $count;
            }
        }
        $sort = isset($spec->sort->field) && is_string($spec->sort->field) && $spec->sort->field !== '' ? (object) ['field' => $spec->sort->field, 'dir' => ($spec->sort->dir ?? null) === 'desc' ? 'desc' : 'asc'] : Missing::Value;
        $actions = [];
        if (($spec->actions ?? null) instanceof stdClass) {
            foreach ($spec->actions as $key => $raw) {
                if (in_array($key, ['$ref', '$patch'], true)) {
                    continue;
                }
                if (is_string($raw)) {
                    $actions[] = (object) ['key' => $key, 'label' => $key, 'behavior' => (object) [$key => $raw]];
                    continue;
                }
                if (!$raw instanceof stdClass) {
                    continue;
                }
                $action = ['key' => $key, 'label' => property_exists($raw, 'label') ? Value::translate($raw->label, $language) : $key];
                if (property_exists($raw, 'format')) {
                    $action['format'] = self::format($raw->format);
                }
                $behavior = [];
                if (($raw->behavior ?? null) instanceof stdClass) {
                    foreach ($raw->behavior as $event => $entry) {
                        $script = is_string($entry) ? $entry : $entry->script ?? null;
                        if (is_string($script)) {
                            $behavior[$event] = $script;
                        }
                    }
                }
                if ($behavior) {
                    $action['behavior'] = (object) $behavior;
                }
                $actions[] = (object) $action;
            }
        }
        return Value::record(['columns' => $columnModels, 'rows' => $rowModels, 'pagination' => (object) $pagination, 'sort' => $sort, 'actions' => $actions, 'empty' => Value::translate($spec->empty ?? null, $language), 'design' => Design::resolve($spec->design ?? null, $data, [])]);
    }

    /**
     * Whether a PHP value is an object: a stdClass or an array that is not a list. An empty array
     * is the empty object only where the object type is fixed (a root argument or a fixed option);
     * a nested value such as a row keeps its type.
     */
    private static function isObject(mixed $value, bool $fixed): bool
    {
        return $value instanceof stdClass || is_array($value) && (!array_is_list($value) || $fixed && $value === []);
    }

    /** An absent or null option is none; any other value must be an object. */
    private static function optionObject(array $options, string $key, string $message): void
    {
        if (isset($options[$key]) && !self::isObject($options[$key], true)) {
            throw new FormError('INVALID_FORM_INPUT', $message);
        }
    }

    /**
     * The page and total options, checked in that order: absent or null is none; otherwise a PHP
     * int or float whose value is an integer from 1 (page) or 0 (total) to 2^53 - 1, returned as int.
     *
     * @return array{page: ?int, total: ?int}
     */
    private static function countOptions(array $options): array
    {
        $counts = [];
        foreach (['page' => [1, 'List page must be a positive integer'], 'total' => [0, 'List total must be a nonnegative integer']] as $key => [$min, $message]) {
            $value = $options[$key] ?? null;
            if ($value === null) {
                $counts[$key] = null;
                continue;
            }
            $integral = is_int($value) || is_float($value) && is_finite($value) && floor($value) === $value;
            if (!$integral || $value < $min || $value > 9007199254740991) {
                throw new FormError('INVALID_FORM_INPUT', $message);
            }
            // An integral float such as 2.0 or -0.0 is the integer 2 or 0.
            $counts[$key] = (int) $value;
        }
        return $counts;
    }

    private static function preloads(stdClass $vm): string
    {
        $seen = [];
        $html = '';
        foreach ($vm->rows as $row) {
            foreach ($row->cells as $cell) {
                $display = $cell->display;
                if (!$display instanceof stdClass || $display->kind !== 'image') {
                    continue;
                }
                $source = $display->src;
                if ($source === '' || str_starts_with(strtolower($source), 'data:') || isset($seen[$source])) {
                    continue;
                }
                $seen[$source] = true;
                $html .= '<link' . Rendering::attrs(['rel' => 'preload', 'as' => 'image', 'href' => Rendering::url($source)]) . '/>';
            }
        }
        return $html;
    }

    private static function format(mixed $format): stdClass
    {
        $options = $format instanceof stdClass ? $format : new stdClass();
        $type = is_string($format) && $format !== '' ? $format : (is_string($options->type ?? null) && $options->type !== '' ? $options->type : 'text');
        return (object) ['type' => $type, 'options' => $options];
    }

    private static function display(stdClass $format, mixed $value, stdClass $row, array $path, string $language): mixed
    {
        $options = $format->options;
        $text = Value::scalar($value);
        switch ($format->type) {
            case 'date':
                $date = Dates::parseUtc($text);
                if ($date === null) {
                    return $text;
                }
                $pattern = is_string($options->pattern ?? null) && $options->pattern !== '' ? $options->pattern : 'YYYY-MM-DD';
                return str_replace(['YYYY', 'MM', 'DD', 'HH', 'mm', 'ss'], [$date->format('Y'), $date->format('m'), $date->format('d'), $date->format('H'), $date->format('i'), $date->format('s')], $pattern);
            case 'number':
                $number = NumberValue::parseString($text);
                if ($number === null || !is_finite($number)) {
                    return $text;
                }
                $places = $options->decimals ?? null;
                $body = is_int($places) || is_float($places) ? Numbers::fixed($number, $places) : Value::scalar($number);
                if ($options->thousands ?? false) {
                    $parts = explode('.', $body);
                    $parts[0] = preg_replace('/\B(?=(\d{3})+(?!\d))/', ',', $parts[0]);
                    $body = implode('.', $parts);
                }
                return Value::translate($options->prefix ?? null, $language) . $body . Value::translate($options->suffix ?? null, $language);
            case 'badge':
                $variant = Value::get($options->map ?? null, $text);
                if ($variant instanceof stdClass) {
                    $label = Value::translate($variant, $language);
                    return (object) ['kind' => 'badge', 'variant' => $label, 'label' => $label];
                }
                return (object) ['kind' => 'badge', 'variant' => Value::scalar($variant), 'label' => $text];
            case 'link':
                $href = $options->href ?? null;
                $href = is_string($href) ? $href : ($href instanceof stdClass ? Design::appearance($href, $row, $path) : '');
                return Value::record(['kind' => 'link', 'href' => self::interpolate($href, $row, $value), 'text' => isset($options->text) && $options->text !== '' ? Value::translate($options->text, $language) : $text, 'target' => is_string($options->target ?? null) && $options->target !== '' ? $options->target : Missing::Value]);
            case 'choice-label':
                $items = $options->items ?? null;
                if ($items instanceof stdClass && !property_exists($items, 'model') || is_array($items)) {
                    $found = Value::get($items, $text);
                    if ($found !== Missing::Value) {
                        // A choice label is content: a string or a language map.
                        return Value::translate($found, $language);
                    }
                }
                return $text;
            case 'bool':
                $truth = is_bool($value) ? $value : (is_int($value) || is_float($value) ? $value != 0 : (is_string($value) ? !in_array($value, ['', '0', 'false'], true) : $value !== null && $value !== Missing::Value));
                $label = Value::get($options, $truth ? 'true' : 'false');
                return (object) ['kind' => 'bool', 'value' => $truth, 'label' => $label !== Missing::Value && $label !== null ? Value::translate($label, $language) : ($truth ? 'true' : 'false'), 'as' => is_string($options->as ?? null) && $options->as !== '' ? $options->as : 'text'];
            case 'image':
                return Value::record(['kind' => 'image', 'src' => $text, 'alt' => self::interpolate(Value::translate($options->alt ?? null, $language), $row, $value), 'width' => property_exists($options, 'width') ? Value::scalar($options->width) : Missing::Value, 'height' => property_exists($options, 'height') ? Value::scalar($options->height) : Missing::Value]);
            case 'html':
                return (object) ['kind' => 'html', 'html' => $text];
            default:
                $limit = $options->truncate ?? null;
                // Only a number limits the text; its integer part counts Unicode code points.
                if ((is_int($limit) || is_float($limit)) && $limit >= 1) {
                    $limit = floor($limit);
                    if (mb_strlen($text, 'UTF-8') > $limit) {
                        return mb_substr($text, 0, (int) $limit, 'UTF-8') . '…';
                    }
                }
                return $text;
        }
    }

    private static function interpolate(string $template, stdClass $row, mixed $cellValue): string
    {
        return preg_replace_callback('/\{=[A-Za-z_][\w.]*\}/', static function ($match) use ($row, $cellValue) {
            $path = substr($match[0], 2, -1);
            $value = $path === 'field' ? $cellValue : Value::path($row, $path);
            return Value::scalar($value === Missing::Value ? $cellValue : $value);
        }, $template);
    }

    private static function node(string $base, stdClass $design): array
    {
        $attrs = ['class' => Value::classes($base, $design->class)];
        $style = Value::style($design->style);
        if ($style !== null) {
            $attrs['style'] = $style;
        }
        return $attrs;
    }

    /** Render one already-evaluated display cell for another read-only renderer. */
    public static function renderCell(stdClass $cell, string $tag, string $base): string
    {
        $display = $cell->display;
        if (is_string($display)) {
            $body = Rendering::text($display);
        } else {
            $body = match ($display->kind) {
                'badge' => Rendering::element('span', ['class' => 'crudui-badge', ...$display->variant !== '' ? ['data-crudui-variant' => $display->variant] : []], Rendering::text($display->label)),
                'link' => Rendering::element('a', ['href' => Rendering::url($display->href), ...isset($display->target) ? ['target' => $display->target] : []], Rendering::text($display->text)),
                'image' => '<img' . Rendering::attrs(['src' => Rendering::url($display->src), 'alt' => $display->alt, ...isset($display->width) ? ['width' => $display->width] : [], ...isset($display->height) ? ['height' => $display->height] : []]) . '/>',
                'bool' => match ($display->as) {
                    'check' => Rendering::element('span', ['class' => 'crudui-bool crudui-bool--check', 'data-crudui-state' => $display->value ? 'true' : 'false', 'aria-label' => $display->label], $display->value ? '✔' : '✘'),
                    'icon' => Rendering::element('span', ['class' => 'crudui-bool crudui-bool--icon', 'data-crudui-state' => $display->value ? 'true' : 'false', 'aria-label' => $display->label]),
                    default => Rendering::element('span', ['class' => 'crudui-bool crudui-bool--text', 'data-crudui-state' => $display->value ? 'true' : 'false'], Rendering::text($display->label)),
                },
                'html' => $display->html,
            };
        }
        return Rendering::element($tag, self::node($base, $cell->design->main), $body);
    }

    private static function cell(stdClass $cell, string $tag, string $base): string
    {
        return self::renderCell($cell, $tag, $base);
    }
}
